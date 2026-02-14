# Next.js UI package for ai-toolkit
# Build with: nix build .#ui
# Run with:   nix run .#ui
{
  lib,
  stdenv,
  buildNpmPackage,
  nodejs_22,
  makeWrapper,
  python3,
  pkg-config,
  sqlite,
  prisma-engines_7,
  ai-toolkit,
  macmon,
}:

buildNpmPackage {
  pname = "ai-toolkit-ui";
  version = "0.1.0";

  src = lib.cleanSourceWith {
    src = ./../ui;
    filter =
      path: type:
      let
        baseName = baseNameOf path;
      in
      !(
        baseName == "node_modules"
        || baseName == ".next"
        || baseName == "dist"
        || baseName == ".env"
        || baseName == "aitk_db.db"
        || baseName == ".turbo"
      );
  };

  npmDepsHash = "sha256-uZBtWvUPFsTG/4Pb8oerDrBj38srJUlsOnc0oMvpcxw=";

  nodejs = nodejs_22;

  # Native module build dependencies (better-sqlite3 uses node-gyp)
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
  # Prisma 7 uses a driver adapter (better-sqlite3) at runtime, so the query
  # engine binary/library is no longer needed. We still need the schema engine
  # for `prisma generate` and `prisma db push`.
  env = {
    PRISMA_SCHEMA_ENGINE_BINARY = "${prisma-engines_7}/bin/schema-engine";
    PRISMA_QUERY_ENGINE_BINARY = "${prisma-engines_7}/bin/query-engine";
    PRISMA_QUERY_ENGINE_LIBRARY = "${prisma-engines_7}/lib/libquery_engine.node";
    PRISMA_FMT_BINARY = "${prisma-engines_7}/bin/prisma-fmt";
    PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING = "1";
    # Dummy DATABASE_URL for prisma generate (not used at runtime)
    DATABASE_URL = "file:./dev.db";
  };

  # Generate Prisma client before the npm build script runs
  preBuild = ''
    npx prisma generate
  '';

  # Default npmBuildScript = "build" runs: next build (worker runs from source via tsx)

  # Custom install phase — ship Next.js standalone output + worker source
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

    # --- Cron worker TypeScript source (runs via tsx at runtime) ---
    cp -r cron $out/lib/ai-toolkit-ui/cron

    # --- Prisma schema + generated client + config (needed at runtime) ---
    cp -r prisma $out/lib/ai-toolkit-ui/prisma
    cp prisma.config.ts $out/lib/ai-toolkit-ui/prisma.config.ts

    # Merge the full build's node_modules over the standalone output.
    # The standalone output includes a minimal node_modules, but the Prisma
    # CLI (used for runtime db push) needs its full transitive dependency
    # tree (e.g. @prisma/config -> effect, c12, etc.).
    cp -r node_modules/. "$out/lib/ai-toolkit-ui/node_modules/"

    # --- Wrapper script ---
    mkdir -p $out/bin
    substitute ${./ai-toolkit-ui-wrapper.sh} $out/bin/ai-toolkit-ui \
      --subst-var-by ui "$out/lib/ai-toolkit-ui" \
      --subst-var-by toolkit "${ai-toolkit}" \
      --subst-var-by prismaEngines7 "${prisma-engines_7}"
    chmod +x $out/bin/ai-toolkit-ui

    wrapProgram $out/bin/ai-toolkit-ui \
      --prefix PATH : ${lib.makeBinPath ([ nodejs_22 ] ++ lib.optionals stdenv.isDarwin [ macmon ])} \
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
