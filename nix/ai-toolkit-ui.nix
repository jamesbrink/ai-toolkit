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

  npmDepsHash = "sha256-0J0NVPTHxL061h50U+ZtFFWG6fmqD3T/JDrCq9DcXPo=";

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
  # @prisma/client version in package.json (currently ^6.19.1).
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
