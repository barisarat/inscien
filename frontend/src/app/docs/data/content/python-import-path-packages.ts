import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "python-import-path-packages",
  kind: "codenote",
  name: "Python Import Path and Package Checks",
  desc: "Debug Python import paths, regular packages, namespace packages, __init__.py behavior, and FastAPI backend import roots.",
  intro:
    "This guide explains how Python resolves imports in a backend project, how to inspect sys.path, how regular packages differ from namespace packages, when __init__.py matters, and how to test whether imports come from the local project or site-packages.",
  sections: [
    {
      title: "Core idea",
      blocks: [
        {
          kind: "text",
          text: [
            "Python imports are resolved from the paths listed in sys.path. In a backend project, the most important path is usually the project root, the folder that contains the application entry file.",
            "If the project root is on sys.path, Python can import folders under that root. For example, from services.auth_service import login_user resolves services from the project folder.",
            "__init__.py is not a magic fix for wrong paths. It changes a folder from a namespace package candidate into a regular package.",
          ],
        },
        {
          kind: "table",
          headers: ["Concept", "Meaning"],
          rows: [
            ["Module", "A Python file, for example auth_service.py"],
            ["Regular package", "A directory with __init__.py"],
            ["Namespace package", "A directory without __init__.py that Python can still import in Python 3.3+"],
            ["Import root", "A folder listed in sys.path where Python starts looking for packages and modules"],
            ["site-packages", "The installed package location inside the Python environment"],
          ],
        },
      ],
    },
    {
      title: "Template project layout",
      blocks: [
        {
          kind: "text",
          text: [
            "Use a generic project layout to understand the import behavior. The same checks apply locally, in Docker, and in production if the working directory is the project root.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `example-backend/
  main.py
  core/
  datasets/
    sentiment/
      router.py
  models/
  repositories/
  routers/
  schemas/
  services/
    email/
      verification.py
    oauth/
      google_service.py
  requirements.txt`,
        },
        {
          kind: "text",
          text: [
            "If commands are run from example-backend, imports like from services.email.verification import parse_signup_verification_code and from datasets.sentiment.router import router resolve against local project folders.",
          ],
        },
      ],
    },
    {
      title: "Check the current import root",
      blocks: [
        {
          kind: "text",
          text: [
            "Run this from the project root. The blank first line in the output means the current working directory is on sys.path.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd example-backend
python -c "import sys; print('\\n'.join(sys.path))"`,
        },
        {
          kind: "text",
          text: [
            "Example output. The first blank line represents the current directory.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `
/usr/lib/python312.zip
/usr/lib/python3.12
/usr/lib/python3.12/lib-dynload
/path/to/example-backend/.venv/lib/python3.12/site-packages`,
        },
        {
          kind: "text",
          bullets: [
            "If the current directory is the project root, local imports resolve from the project.",
            "If the command is run from the wrong directory, Python may not find the local package.",
            "If a top-level name conflicts with site-packages, Python may import the wrong package depending on the package type and path order.",
          ],
        },
      ],
    },
    {
      title: "Check where a package is imported from",
      blocks: [
        {
          kind: "text",
          text: [
            "Use __file__ and __path__ to inspect what Python imported. This confirms whether Python is using the local project folder or an installed package from site-packages.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `python -c "import datasets; print('datasets file:', getattr(datasets, '__file__', None)); print('datasets path:', list(getattr(datasets, '__path__', [])))"

python -c "import services; print('services file:', getattr(services, '__file__', None)); print('services path:', list(getattr(services, '__path__', [])))"

python -c "import routers; print('routers file:', getattr(routers, '__file__', None)); print('routers path:', list(getattr(routers, '__path__', [])))"`,
        },
        {
          kind: "text",
          text: ["Interpret the result:"],
        },
        {
          kind: "table",
          headers: ["Output", "Meaning"],
          rows: [
            ["file points to /path/to/example-backend/services/__init__.py", "services is a local regular package"],
            ["file is None and path points to /path/to/example-backend/datasets", "datasets is a local namespace package"],
            ["file points to .venv/.../site-packages/datasets/__init__.py", "Python imported the installed datasets library"],
            ["ModuleNotFoundError", "The import root is wrong or the package does not exist"],
          ],
        },
      ],
    },
    {
      title: "Test exact imports",
      blocks: [
        {
          kind: "text",
          text: [
            "Test the actual imports used by the app. This verifies the module path without starting the server.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `python -c "import datasets.sentiment.router as r; print(r.__file__)"

python -c "from datasets.sentiment.router import router as topic_sentiment_router; print(topic_sentiment_router)"

python -c "from services.oauth.google_service import start_google_oauth; print(start_google_oauth)"

python -c "import main; print('main imported successfully')"`,
        },
        {
          kind: "text",
          text: [
            "A good result for the router import should point to the local project file.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `/path/to/example-backend/datasets/sentiment/router.py`,
        },
        {
          kind: "text",
          text: [
            "If Python finds the correct file but fails with cannot import name, the path is not the problem. The module was found, but the requested function, class, or variable does not exist under that exact name.",
          ],
        },
      ],
    },
    {
      title: "Regular package versus namespace package",
      blocks: [
        {
          kind: "text",
          text: [
            "A regular package is a directory with __init__.py. A namespace package is a directory without __init__.py that Python can still import in Python 3.3 and newer.",
          ],
        },
        {
          kind: "table",
          headers: ["Package type", "Directory shape", "Behavior"],
          rows: [
            ["Regular package", "services/__init__.py", "Python treats services as one explicit package folder"],
            ["Namespace package", "datasets/ without __init__.py", "Python can assemble datasets from matching directories on sys.path"],
          ],
        },
        {
          kind: "text",
          text: [
            "Namespace packages are valid Python. They are useful when a package is intentionally split across multiple locations. For normal app code, regular packages are more explicit.",
          ],
        },
      ],
    },
    {
      title: "When imports work without __init__.py",
      blocks: [
        {
          kind: "text",
          text: [
            "This works in Python 3.3+ when the project root is on sys.path and there is no conflicting top-level regular package that wins first.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `example-backend/
  main.py
  app1/
    services/
      email.py
  app2/
    services/
      payment.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from app1.services.email import send_email
from app2.services.payment import charge`,
        },
        {
          kind: "text",
          text: [
            "This is safer than importing from a generic top-level services package because app1 and app2 are the top-level names.",
          ],
        },
      ],
    },
    {
      title: "When __init__.py does not fix the problem",
      blocks: [
        {
          kind: "text",
          text: [
            "__init__.py does not fix a wrong import root. If Python starts searching from the wrong folder, it will not reach the correct package.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `project/
  example-backend/
    main.py
    services/
      __init__.py
      email/
        __init__.py
        verification.py`,
        },
        {
          kind: "text",
          text: [
            "This command fails because Python searches project/services, but the real folder is project/example-backend/services.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd project
python -c "from services.email.verification import parse_signup_verification_code"`,
        },
        {
          kind: "text",
          text: ["Fix it by running from the project root or setting PYTHONPATH."],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd project/example-backend
python -c "from services.email.verification import parse_signup_verification_code"

cd project
PYTHONPATH=example-backend python -c "from services.email.verification import parse_signup_verification_code"`,
        },
      ],
    },
    {
      title: "Top-level name conflicts",
      blocks: [
        {
          kind: "text",
          text: [
            "Generic top-level folder names can conflict with installed libraries. A common example is datasets, because datasets is also a third-party package name.",
          ],
        },
        {
          kind: "table",
          headers: ["Local name", "Conflict risk"],
          rows: [
            ["datasets", "High, because some projects install a package named datasets"],
            ["core", "Medium, generic name"],
            ["models", "Medium, generic name"],
            ["schemas", "Medium, generic name"],
            ["services", "Medium, generic name"],
            ["routers", "Lower, but still generic"],
          ],
        },
        {
          kind: "text",
          text: [
            "If the app has a local top-level datasets package and also needs the external datasets library, the clean fix is to rename the local package or move it under a unique app package.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `example-backend/
  app/
    __init__.py
    datasets/
      __init__.py
      sentiment/
        __init__.py
        router.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from app.datasets.sentiment.router import router as topic_sentiment_router
from datasets import load_dataset`,
        },
      ],
    },
    {
      title: "What __init__.py changes",
      blocks: [
        {
          kind: "text",
          text: [
            "__init__.py changes package identity. It says this directory is a regular package and not just a namespace package portion.",
          ],
        },
        {
          kind: "table",
          headers: ["With __init__.py", "Without __init__.py"],
          rows: [
            ["Regular package", "Namespace package candidate"],
            ["Has a concrete __file__", "__file__ may be None"],
            ["Does not merge with same-named namespace portions", "Can merge with same-named folders on sys.path"],
            ["Can contain package initialization code", "No package initialization file"],
            ["Clearer for tools and humans", "Valid, but more implicit"],
          ],
        },
        {
          kind: "text",
          text: [
            "It does not solve wrong working directory, wrong PYTHONPATH, or bad top-level naming by itself.",
          ],
        },
      ],
    },
    {
      title: "When to add __init__.py",
      blocks: [
        {
          kind: "text",
          text: [
            "For normal backend code, use empty __init__.py files when you want explicit regular packages.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `touch core/__init__.py
touch datasets/__init__.py
touch datasets/sentiment/__init__.py
touch models/__init__.py
touch repositories/__init__.py
touch routers/__init__.py
touch schemas/__init__.py
touch services/__init__.py
touch services/email/__init__.py
touch services/oauth/__init__.py`,
        },
        {
          kind: "text",
          bullets: [
            "Add __init__.py to folders used in import paths.",
            "The files can be empty.",
            "Do not add __init__.py to documentation folders unless Python imports from them.",
            "If a top-level folder conflicts with a library name, prefer renaming or moving it under app instead of relying only on __init__.py.",
          ],
        },
      ],
    },
    {
      title: "__all__ in __init__.py",
      blocks: [
        {
          kind: "text",
          text: [
            "__all__ is not required for normal backend imports. It only controls wildcard imports such as from services import *.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `__all__ = []`,
        },
        {
          kind: "text",
          text: [
            "This means wildcard imports expose nothing by default. In most backend apps, empty __init__.py files are enough unless package-level exports are intentionally needed.",
          ],
        },
      ],
    },
    {
      title: "Check a missing imported name",
      blocks: [
        {
          kind: "text",
          text: [
            "If the module path resolves but Python says cannot import name, inspect the names exported by the module.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `python -c "import services.email.verification as v; print([name for name in dir(v) if 'verification' in name or 'signup' in name or 'code' in name])"

grep -n "def .*verification\\|def .*signup\\|def .*code" services/email/verification.py`,
        },
        {
          kind: "text",
          text: [
            "This error means Python found the file but the requested function name does not exist in that module.",
          ],
        },
      ],
    },
    {
      title: "Recommended long-term structure",
      blocks: [
        {
          kind: "text",
          text: [
            "The cleanest long-term backend structure is to use one unique top-level app package. This avoids generic top-level names such as datasets, services, models, and schemas.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `example-backend/
  main.py
  app/
    __init__.py
    core/
      __init__.py
    datasets/
      __init__.py
      sentiment/
        __init__.py
        router.py
    models/
      __init__.py
    repositories/
      __init__.py
    routers/
      __init__.py
    schemas/
      __init__.py
    services/
      __init__.py
      email/
        __init__.py
        verification.py
      oauth/
        __init__.py
        google_service.py`,
        },
        {
          kind: "code",
          language: "python",
          code: `from app.datasets.sentiment.router import router as topic_sentiment_router
from app.services.email.verification import parse_signup_verification_code`,
        },
        {
          kind: "text",
          text: [
            "This structure keeps external libraries available under their normal names.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `from datasets import load_dataset`,
        },
      ],
    },
    {
      title: "FastAPI and Docker checklist",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Run FastAPI from the project root, the folder that contains main.py.",
            "In Docker, set WORKDIR to the project root.",
            "Check sys.path from inside the container, not only from the host.",
            "Use import main as a quick runtime import test.",
            "Use module __file__ checks to confirm whether imports come from local code or site-packages.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `pwd
python -c "import sys; print('\\n'.join(sys.path))"
python -c "import main; print('main imported successfully')"
python -c "import datasets.sentiment.router as r; print(r.__file__)"
python -c "import services; print(getattr(services, '__file__', None)); print(list(getattr(services, '__path__', [])))"`,
        },
      ],
    },
    {
      title: "Practical rule",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Imports depend on sys.path and the selected import root.",
            "__init__.py turns a directory into a regular package.",
            "No __init__.py means Python 3.3+ can still import the folder as a namespace package.",
            "Namespace packages are safe when the import root is controlled and top-level names do not conflict.",
            "Regular packages are clearer when the folder is part of the app codebase.",
            "Top-level name conflicts are best solved by using a unique app package, not by relying only on __init__.py.",
          ],
        },
      ],
    },
  ],
}

export default entry