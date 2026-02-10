# Next.js UI package for ai-toolkit
# Build with: nix build .#ui
# Run with:   nix run .#ui
{ lib
, buildNpmPackage
, nodejs_22
, makeWrapper
, python3
, pkg-config
, sqlite
, prisma-engines_6
, ai-toolkit
}:

buildNpmPackage {
  pname = "ai-toolkit-ui";
  version = "0.1.0";

  src = lib.cleanSourceWith {
    src = ./../ui;
    filter = path: type:
      let baseName = baseNameOf path; in
      !(baseName == "node_modules" || baseName == ".next"
        || baseName == "dist" || baseName == ".env"
        || baseName == "aitk_db.db" || baseName == ".turbo");
  };

  npmDepsHash = "sha256-NBvuZhSNKN+YF4QeLxCftYWgOpgC2pSNJdtPkecjOf8=";

  nodejs = nodejs_22;

  # Native module build dependencies (sqlite3 uses node-gyp)
  nativeBuildInputs = [
    makeWrapper
    python3
    pkg-config
  ];

  buildInputs = [
    sqlite
  ];

  # Make npm cache writable (Prisma postinstall may need this)
  makeCacheWritable = true;

  # Prisma engine configuration — avoids network downloads in the sandbox.
  # NOTE: prisma-engines_6 version in nixpkgs must be compatible with the
  # @prisma/client version in package.json (currently ^6.3.1).
  # If the build fails with a version mismatch, override prisma-engines_6.
  env = {
    PRISMA_SCHEMA_ENGINE_BINARY = "${prisma-engines_6}/bin/schema-engine";
    PRISMA_QUERY_ENGINE_BINARY = "${prisma-engines_6}/bin/query-engine";
    PRISMA_QUERY_ENGINE_LIBRARY = "${prisma-engines_6}/lib/libquery_engine.node";
    PRISMA_FMT_BINARY = "${prisma-engines_6}/bin/prisma-fmt";
    PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING = "1";
    # Dummy DATABASE_URL for prisma generate (not used at runtime)
    DATABASE_URL = "file:./dev.db";
  };

  # Generate Prisma client before the npm build script runs
  preBuild = ''
    npx prisma generate
  '';

  # Default npmBuildScript = "build" runs: tsc -p tsconfig.worker.json && next build

  # Custom install phase — ship Next.js standalone output + compiled worker
  installPhase = ''
    runHook preInstall

    mkdir -p $out/lib/ai-toolkit-ui

    # --- Next.js standalone server ---
    cp -r .next/standalone/. $out/lib/ai-toolkit-ui/

    # Static assets (not included in standalone output)
    mkdir -p $out/lib/ai-toolkit-ui/.next/static
    cp -r .next/static/. $out/lib/ai-toolkit-ui/.next/static/

    # Public directory
    if [ -d public ]; then
      cp -r public $out/lib/ai-toolkit-ui/public
    fi

    # --- Compiled cron worker ---
    mkdir -p $out/lib/ai-toolkit-ui/dist/cron
    cp -r dist/cron/. $out/lib/ai-toolkit-ui/dist/cron/

    # --- Prisma schema + generated client (needed at runtime) ---
    cp -r prisma $out/lib/ai-toolkit-ui/prisma

    # Ensure Prisma runtime modules are available (client, engines, CLI).
    # The standalone output may include @prisma/client but not @prisma/engines
    # or the prisma CLI.  Merge the full build's node_modules on top.
    mkdir -p "$out/lib/ai-toolkit-ui/node_modules"
    for dir in .prisma @prisma prisma; do
      if [ -d "node_modules/$dir" ]; then
        mkdir -p "$out/lib/ai-toolkit-ui/node_modules/$dir"
        cp -r "node_modules/$dir/." "$out/lib/ai-toolkit-ui/node_modules/$dir/"
      fi
    done

    # Prisma CLI binary for runtime db push
    if [ -d "node_modules/.bin" ]; then
      mkdir -p "$out/lib/ai-toolkit-ui/node_modules/.bin"
      cp -P node_modules/.bin/prisma "$out/lib/ai-toolkit-ui/node_modules/.bin/prisma" 2>/dev/null || true
    fi

    # --- Wrapper script ---
    mkdir -p $out/bin
    substitute ${./ai-toolkit-ui-wrapper.sh} $out/bin/ai-toolkit-ui \
      --subst-var-by ui "$out/lib/ai-toolkit-ui" \
      --subst-var-by toolkit "${ai-toolkit}" \
      --subst-var-by prismaEngines6 "${prisma-engines_6}"
    chmod +x $out/bin/ai-toolkit-ui

    wrapProgram $out/bin/ai-toolkit-ui \
      --prefix PATH : ${lib.makeBinPath [ nodejs_22 ]} \
      --set NODE_ENV "production"

    runHook postInstall
  '';

  meta = with lib; {
    description = "AI Toolkit Web UI - Next.js dashboard for training job management";
    homepage = "https://github.com/ostris/ai-toolkit";
    license = licenses.asl20;
    platforms = platforms.unix;
    mainProgram = "ai-toolkit-ui";
  };
}
