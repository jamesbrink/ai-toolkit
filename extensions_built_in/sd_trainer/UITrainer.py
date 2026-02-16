from collections import OrderedDict
import json
import os
import sqlite3
import asyncio
import concurrent.futures
from extensions_built_in.sd_trainer.SDTrainer import SDTrainer
from typing import Literal, Optional
import threading
import time
import signal

AITK_Status = Literal["running", "stopped", "error", "completed", "queued"]


class UITrainer(SDTrainer):
    def __init__(self, process_id: int, job, config: OrderedDict, **kwargs):
        super(UITrainer, self).__init__(process_id, job, config, **kwargs)
        self.sqlite_db_path = self.config.get("sqlite_db_path", "./aitk_db.db")
        if not os.path.exists(self.sqlite_db_path):
            raise Exception(
                f"SQLite database not found at {self.sqlite_db_path}")
        print(f"Using SQLite database at {self.sqlite_db_path}")
        self.job_id = os.environ.get("AITK_JOB_ID", None)
        self.job_id = self.job_id.strip() if self.job_id is not None else None
        print(f"Job ID: \"{self.job_id}\"")
        if self.job_id is None:
            raise Exception("AITK_JOB_ID not set")
        self.is_stopping = False
        # Create a thread pool for database operations
        self.thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
        # Track all async tasks
        self._async_tasks = []
        # Initialize the status
        self._run_async_operation(self._update_status("running", "Starting"))
        self._stop_watcher_started = False
        # Config override checking (throttled to every 10 steps)
        self._override_check_counter = 0
        self._override_check_interval = 10
        # self.start_stop_watcher(interval_sec=2.0)
    
    def start_stop_watcher(self, interval_sec: float = 5.0):
        """
        Start a daemon thread that periodically checks should_stop()
        and terminates the process immediately when triggered.
        """
        if getattr(self, "_stop_watcher_started", False):
            return
        self._stop_watcher_started = True
        t = threading.Thread(
            target=self._stop_watcher_thread, args=(interval_sec,), daemon=True
        )
        t.start()

    def _stop_watcher_thread(self, interval_sec: float):
        while True:
            try:
                if self.should_stop():
                    # Mark and update status (non-blocking; uses existing infra)
                    self.is_stopping = True
                    self._run_async_operation(
                        self._update_status("stopped", "Job stopped (remote)")
                    )
                    # Best-effort flush pending async ops
                    try:
                        asyncio.run(self.wait_for_all_async())
                    except RuntimeError:
                        pass
                    # Try to stop DB thread pool quickly
                    try:
                        self.thread_pool.shutdown(wait=False, cancel_futures=True)
                    except TypeError:
                        self.thread_pool.shutdown(wait=False)
                    print("")
                    print("****************************************************")
                    print("    Stop signal received; terminating process.      ")
                    print("****************************************************")
                    os.kill(os.getpid(), signal.SIGINT)
                time.sleep(interval_sec)
            except Exception:
                time.sleep(interval_sec)

    def _run_async_operation(self, coro):
        """Helper method to run an async coroutine and track the task."""
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            # No event loop exists, create a new one
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        # Create a task and track it
        if loop.is_running():
            task = asyncio.run_coroutine_threadsafe(coro, loop)
            self._async_tasks.append(asyncio.wrap_future(task))
        else:
            task = loop.create_task(coro)
            self._async_tasks.append(task)
            loop.run_until_complete(task)

    async def _execute_db_operation(self, operation_func):
        """Execute a database operation in a separate thread to avoid blocking."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(self.thread_pool, operation_func)

    def _db_connect(self):
        """Create a new connection for each operation to avoid locking."""
        conn = sqlite3.connect(self.sqlite_db_path, timeout=10.0)
        conn.isolation_level = None  # Enable autocommit mode
        return conn

    def should_stop(self):
        def _check_stop():
            with self._db_connect() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT stop FROM Job WHERE id = ?", (self.job_id,))
                stop = cursor.fetchone()
                return False if stop is None else stop[0] == 1

        return _check_stop()
    
    def should_return_to_queue(self):
        def _check_return_to_queue():
            with self._db_connect() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT return_to_queue FROM Job WHERE id = ?", (self.job_id,))
                return_to_queue = cursor.fetchone()
                return False if return_to_queue is None else return_to_queue[0] == 1

        return _check_return_to_queue()

    def maybe_stop(self):
        if self.should_stop():
            self._run_async_operation(
                self._update_status("stopped", "Job stopped"))
            self.is_stopping = True
            raise Exception("Job stopped")
        if self.should_return_to_queue():
            self._run_async_operation(
                self._update_status("queued", "Job queued"))
            self.is_stopping = True
            raise Exception("Job returning to queue")

    async def _update_key(self, key, value):
        if not self.accelerator.is_main_process:
            return

        def _do_update():
            with self._db_connect() as conn:
                cursor = conn.cursor()
                cursor.execute("BEGIN IMMEDIATE")
                try:
                    # Convert the value to string if it's not already
                    if isinstance(value, str):
                        value_to_insert = value
                    else:
                        value_to_insert = str(value)

                    # Use parameterized query for both the column name and value
                    update_query = f"UPDATE Job SET {key} = ? WHERE id = ?"
                    cursor.execute(
                        update_query, (value_to_insert, self.job_id))
                finally:
                    cursor.execute("COMMIT")

        await self._execute_db_operation(_do_update)

    def update_step(self):
        """Non-blocking update of the step count."""
        if self.accelerator.is_main_process:
            self._run_async_operation(self._update_key("step", self.step_num))

    def update_db_key(self, key, value):
        """Non-blocking update a key in the database."""
        if self.accelerator.is_main_process:
            self._run_async_operation(self._update_key(key, value))

    async def _update_status(self, status: AITK_Status, info: Optional[str] = None):
        if not self.accelerator.is_main_process:
            return

        def _do_update():
            with self._db_connect() as conn:
                cursor = conn.cursor()
                cursor.execute("BEGIN IMMEDIATE")
                try:
                    if info is not None:
                        cursor.execute(
                            "UPDATE Job SET status = ?, info = ? WHERE id = ?",
                            (status, info, self.job_id)
                        )
                    else:
                        cursor.execute(
                            "UPDATE Job SET status = ? WHERE id = ?",
                            (status, self.job_id)
                        )
                finally:
                    cursor.execute("COMMIT")

        await self._execute_db_operation(_do_update)

    def update_status(self, status: AITK_Status, info: Optional[str] = None):
        """Non-blocking update of status."""
        if self.accelerator.is_main_process:
            self._run_async_operation(self._update_status(status, info))

    async def wait_for_all_async(self):
        """Wait for all tracked async operations to complete."""
        if not self._async_tasks:
            return

        try:
            await asyncio.gather(*self._async_tasks)
        except Exception:
            pass
        finally:
            # Clear the task list after completion
            self._async_tasks.clear()

    def on_error(self, e: Exception):
        super(UITrainer, self).on_error(e)
        if self.accelerator.is_main_process and not self.is_stopping:
            self.update_status("error", str(e))
        self.update_db_key("step", self.last_save_step)
        asyncio.run(self.wait_for_all_async())
        self.thread_pool.shutdown(wait=True)

    def handle_timing_print_hook(self, timing_dict):
        if "train_loop" not in timing_dict:
            print("train_loop not found in timing_dict", timing_dict)
            return
        seconds_per_iter = timing_dict["train_loop"]
        # determine iter/sec or sec/iter
        if seconds_per_iter < 1:
            iters_per_sec = 1 / seconds_per_iter
            self.update_db_key("speed_string", f"{iters_per_sec:.2f} iter/sec")
        else:
            self.update_db_key(
                "speed_string", f"{seconds_per_iter:.2f} sec/iter")

    def done_hook(self):
        super(UITrainer, self).done_hook()
        self.update_status("completed", "Training completed")
        # Wait for all async operations to finish before shutting down
        asyncio.run(self.wait_for_all_async())
        self.thread_pool.shutdown(wait=True)

    # -- Live config override support --
    # Allowed keys mapped to (config_object_attr, field_name) or special handler
    _OVERRIDE_KEYS = {
        'sample_every': ('sample_config', 'sample_every'),
        'save_every': ('save_config', 'save_every'),
        'log_every': ('logging_config', 'log_every'),
        'lr': None,  # special: updates optimizer param_groups
        'cfg_scale': ('train_config', 'cfg_scale'),
        'gradient_accumulation': ('train_config', 'gradient_accumulation'),
    }

    def _read_config_overrides(self):
        """Read config_overrides column from the Job row via thread pool to avoid blocking training."""
        def _read():
            with self._db_connect() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT config_overrides FROM Job WHERE id = ?", (self.job_id,))
                row = cursor.fetchone()
                if row is None or not row[0]:
                    return {}
                try:
                    return json.loads(row[0])
                except (json.JSONDecodeError, TypeError):
                    return {}
        # Run in thread pool so SQLite lock waits don't block the training loop
        future = self.thread_pool.submit(_read)
        try:
            return future.result(timeout=2.0)
        except Exception:
            return {}

    def check_config_overrides(self):
        """Check for live config overrides from the UI and apply them."""
        overrides = self._read_config_overrides()
        if not overrides:
            return

        for key, value in overrides.items():
            if key not in self._OVERRIDE_KEYS:
                continue

            mapping = self._OVERRIDE_KEYS[key]

            if mapping is None and key == 'lr':
                # Special handling for learning rate: update optimizer param_groups
                if self.optimizer is not None:
                    current_lr = self.optimizer.param_groups[0].get('lr')
                    if current_lr != value:
                        for pg in self.optimizer.param_groups:
                            pg['lr'] = value
                        print(f"[LiveConfig] lr: {current_lr} -> {value}")
                continue

            config_attr, field_name = mapping
            config_obj = getattr(self, config_attr, None)
            if config_obj is None:
                continue

            current = getattr(config_obj, field_name, None)
            if current != value:
                setattr(config_obj, field_name, value)
                print(f"[LiveConfig] {key}: {current} -> {value}")

    def end_step_hook(self):
        super(UITrainer, self).end_step_hook()
        self.update_step()
        # Check for live config overrides (throttled)
        self._override_check_counter += 1
        if self._override_check_counter >= self._override_check_interval:
            self._override_check_counter = 0
            self.check_config_overrides()
        self.maybe_stop()

    def hook_before_model_load(self):
        super().hook_before_model_load()
        self.maybe_stop()
        self.update_status("running", "Loading model")

    def before_dataset_load(self):
        super().before_dataset_load()
        self.maybe_stop()
        self.update_status("running", "Loading dataset")

    def hook_before_train_loop(self):
        super().hook_before_train_loop()
        self.maybe_stop()
        self.update_step()
        self.update_status("running", "Training")
        self.timer.add_after_print_hook(self.handle_timing_print_hook)

    def status_update_hook_func(self, string):
        self.update_status("running", string)

    def hook_after_sd_init_before_load(self):
        super().hook_after_sd_init_before_load()
        self.maybe_stop()
        self.sd.add_status_update_hook(self.status_update_hook_func)

    def sample_step_hook(self, img_num, total_imgs):
        super().sample_step_hook(img_num, total_imgs)
        self.maybe_stop()
        self.update_status(
            "running", f"Generating images - {img_num + 1}/{total_imgs}")

    def sample(self, step=None, is_first=False):
        self.maybe_stop()
        total_imgs = len(self.sample_config.prompts)
        self.update_status("running", f"Generating images - 0/{total_imgs}")
        super().sample(step, is_first)
        self.maybe_stop()
        self.update_status("running", "Training")

    def save(self, step=None):
        self.maybe_stop()
        self.update_status("running", "Saving model")
        super().save(step)
        self.maybe_stop()
        self.update_status("running", "Training")
