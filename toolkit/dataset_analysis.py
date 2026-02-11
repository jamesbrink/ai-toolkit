#!/usr/bin/env python3
"""
Dataset quality analysis and face detection using OpenCV.

Called by the Node.js UI via child_process. Reads image paths from a file,
outputs NDJSON (one JSON line per image, final summary line) to stdout.

Usage:
    python toolkit/dataset_analysis.py --mode analyze --images-file /tmp/paths.txt [--training-resolution 512]
    python toolkit/dataset_analysis.py --mode face-crop --images-file /tmp/paths.txt --output-dir /path/to/crops [--training-resolution 512] [--padding 1.8]
"""

import argparse
import json
import os
import sys
import urllib.request

import cv2
import numpy as np

# YuNet model URL and local cache path
_YUNET_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
_YUNET_MODEL_PATH: str | None = None


def _get_yunet_model_path() -> str:
    """Return path to the YuNet ONNX model, downloading it on first use."""
    global _YUNET_MODEL_PATH
    if _YUNET_MODEL_PATH and os.path.exists(_YUNET_MODEL_PATH):
        return _YUNET_MODEL_PATH

    cache_dir = os.path.join(
        os.environ.get("AI_TOOLKIT_UI_DATA", os.path.expanduser("~/.local/share/ai-toolkit")),
        "models",
    )
    os.makedirs(cache_dir, exist_ok=True)
    model_path = os.path.join(cache_dir, "face_detection_yunet_2023mar.onnx")

    if not os.path.exists(model_path):
        print(json.dumps({"type": "info", "message": "Downloading YuNet face detection model..."}), flush=True)
        urllib.request.urlretrieve(_YUNET_URL, model_path)

    _YUNET_MODEL_PATH = model_path
    return model_path


def compute_blur(gray: np.ndarray) -> float:
    """Laplacian variance — standard Pech-Pacheco blur metric."""
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def compute_brightness(gray: np.ndarray) -> float:
    """Mean pixel intensity (0-255)."""
    return float(np.mean(gray))


def compute_contrast(gray: np.ndarray) -> float:
    """Standard deviation of pixel intensities."""
    return float(np.std(gray))


def detect_faces(img: np.ndarray, score_threshold: float = 0.5) -> list[dict]:
    """Detect faces using YuNet DNN model. Returns list of {x, y, w, h, confidence}."""
    h, w = img.shape[:2]
    model_path = _get_yunet_model_path()

    detector = cv2.FaceDetectorYN.create(
        model_path, "", (w, h),
        score_threshold=score_threshold,
        nms_threshold=0.3,
        top_k=5000,
    )

    _, faces = detector.detect(img)

    results = []
    if faces is not None:
        for face in faces:
            results.append({
                "x": int(face[0]),
                "y": int(face[1]),
                "w": int(face[2]),
                "h": int(face[3]),
                "confidence": round(float(face[-1]), 2),
            })

    return results


def analyze_image(image_path: str, training_resolution: int = 512) -> dict:
    """Analyze a single image and return quality metrics."""
    img = cv2.imread(image_path)
    if img is None:
        return {"filePath": image_path, "error": f"Failed to read image: {image_path}"}

    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    laplacian_var = compute_blur(gray)
    brightness = compute_brightness(gray)
    contrast = compute_contrast(gray)
    faces = detect_faces(img)

    is_blurry = laplacian_var < 100
    is_dark = brightness < 50
    is_bright = brightness > 200
    is_low_contrast = contrast < 20
    is_too_small = min(w, h) < training_resolution

    # Quality score formula
    quality_score = 100
    if is_blurry:
        quality_score -= 30
    if is_dark:
        quality_score -= 15
    if is_bright:
        quality_score -= 15
    if is_low_contrast:
        quality_score -= 15
    if is_too_small:
        quality_score -= 20
    quality_score = max(0, quality_score)

    stat = os.stat(image_path)

    return {
        "type": "image_result",
        "filePath": image_path,
        "width": w,
        "height": h,
        "fileSize": stat.st_size,
        "laplacianVariance": round(laplacian_var, 2),
        "avgBrightness": round(brightness, 2),
        "contrast": round(contrast, 2),
        "isBlurry": is_blurry,
        "isDark": is_dark,
        "isBright": is_bright,
        "isLowContrast": is_low_contrast,
        "isTooSmall": is_too_small,
        "hasFaces": len(faces) > 0,
        "faceCount": len(faces),
        "faces": faces,
        "qualityScore": quality_score,
        "fileModifiedAt": stat.st_mtime,
    }


def face_crop_image(
    image_path: str,
    output_dir: str,
    training_resolution: int = 512,
    padding: float = 1.8,
) -> list[dict]:
    """Crop faces from an image with padding. Returns list of crop info dicts."""
    img = cv2.imread(image_path)
    if img is None:
        return [{"filePath": image_path, "error": f"Failed to read image: {image_path}"}]

    h, w = img.shape[:2]
    faces = detect_faces(img)

    if not faces:
        return []

    base_name = os.path.splitext(os.path.basename(image_path))[0]
    base_ext = os.path.splitext(image_path)[1]
    caption_path = os.path.splitext(image_path)[0] + ".txt"
    caption_text = None
    if os.path.exists(caption_path):
        with open(caption_path, "r", encoding="utf-8") as f:
            caption_text = f.read()

    crops = []
    for i, face in enumerate(faces):
        fx, fy, fw, fh = face["x"], face["y"], face["w"], face["h"]

        # Calculate padded square crop centered on face
        face_cx = fx + fw / 2
        face_cy = fy + fh / 2
        crop_size = max(fw, fh) * padding
        half = crop_size / 2

        x1 = int(max(0, face_cx - half))
        y1 = int(max(0, face_cy - half))
        x2 = int(min(w, face_cx + half))
        y2 = int(min(h, face_cy + half))

        cropped = img[y1:y2, x1:x2]
        if cropped.size == 0:
            continue

        # Resize to training resolution
        cropped = cv2.resize(
            cropped,
            (training_resolution, training_resolution),
            interpolation=cv2.INTER_LANCZOS4,
        )

        # Save crop
        crop_name = f"{base_name}_face{i}{base_ext}"
        crop_path = os.path.join(output_dir, crop_name)
        cv2.imwrite(crop_path, cropped)

        # Copy caption if exists
        if caption_text is not None:
            crop_caption_path = os.path.join(
                output_dir, f"{base_name}_face{i}.txt"
            )
            with open(crop_caption_path, "w", encoding="utf-8") as f:
                f.write(caption_text)

        crops.append({
            "type": "crop_result",
            "sourcePath": image_path,
            "cropPath": crop_path,
            "faceIndex": i,
            "faceBox": face,
        })

    return crops


def emit(obj: dict):
    """Write a JSON line to stdout."""
    print(json.dumps(obj), flush=True)


def main():
    parser = argparse.ArgumentParser(description="Dataset quality analysis with OpenCV")
    parser.add_argument("--mode", required=True, choices=["analyze", "face-crop"])
    parser.add_argument("--images-file", required=True, help="File with newline-delimited image paths")
    parser.add_argument("--output-dir", help="Output directory for face crops")
    parser.add_argument("--training-resolution", type=int, default=512)
    parser.add_argument("--padding", type=float, default=1.8, help="Face crop padding multiplier")
    args = parser.parse_args()

    # Read image paths
    with open(args.images_file, "r", encoding="utf-8") as f:
        image_paths = [line.strip() for line in f if line.strip()]

    total = len(image_paths)

    if args.mode == "analyze":
        summary = {
            "blurryCount": 0,
            "darkCount": 0,
            "brightCount": 0,
            "lowContrastCount": 0,
            "tooSmallCount": 0,
            "facesCount": 0,
            "totalFaces": 0,
            "totalScore": 0,
        }

        for i, img_path in enumerate(image_paths):
            try:
                result = analyze_image(img_path, args.training_resolution)
                if "error" in result:
                    emit({"type": "error", "filePath": img_path, "error": result["error"]})
                else:
                    emit(result)
                    if result["isBlurry"]:
                        summary["blurryCount"] += 1
                    if result["isDark"]:
                        summary["darkCount"] += 1
                    if result["isBright"]:
                        summary["brightCount"] += 1
                    if result["isLowContrast"]:
                        summary["lowContrastCount"] += 1
                    if result["isTooSmall"]:
                        summary["tooSmallCount"] += 1
                    if result["hasFaces"]:
                        summary["facesCount"] += 1
                    summary["totalFaces"] += result["faceCount"]
                    summary["totalScore"] += result["qualityScore"]
            except Exception as e:
                emit({"type": "error", "filePath": img_path, "error": str(e)})

            emit({"type": "progress", "current": i + 1, "total": total})

        avg_score = round(summary["totalScore"] / total) if total > 0 else 100
        emit({
            "type": "summary",
            "total": total,
            "blurryCount": summary["blurryCount"],
            "darkCount": summary["darkCount"],
            "brightCount": summary["brightCount"],
            "lowContrastCount": summary["lowContrastCount"],
            "tooSmallCount": summary["tooSmallCount"],
            "facesCount": summary["facesCount"],
            "totalFaces": summary["totalFaces"],
            "avgQualityScore": avg_score,
        })

    elif args.mode == "face-crop":
        if not args.output_dir:
            emit({"type": "error", "error": "--output-dir is required for face-crop mode"})
            sys.exit(1)

        os.makedirs(args.output_dir, exist_ok=True)
        total_crops = 0

        for i, img_path in enumerate(image_paths):
            try:
                crops = face_crop_image(
                    img_path,
                    args.output_dir,
                    args.training_resolution,
                    args.padding,
                )
                for crop in crops:
                    if "error" in crop:
                        emit({"type": "error", "filePath": img_path, "error": crop["error"]})
                    else:
                        emit(crop)
                        total_crops += 1
            except Exception as e:
                emit({"type": "error", "filePath": img_path, "error": str(e)})

            emit({"type": "progress", "current": i + 1, "total": total})

        emit({
            "type": "summary",
            "totalImages": total,
            "totalCrops": total_crops,
            "outputDir": args.output_dir,
        })


if __name__ == "__main__":
    main()
