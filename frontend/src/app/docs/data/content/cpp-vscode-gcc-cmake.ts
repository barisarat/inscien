import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "cpp-vscode-gcc-cmake",
  kind: "codenote",
  name: "C++ VS Code GCC CMake Setup",
  desc: "Initial C++ development setup on Ubuntu with GCC, CMake, GDB, Ninja, and VS Code.",
  intro:
    "This page sets up a simple C++ project with GCC, CMake, GDB, Ninja, and VS Code. It is designed as a first working reference for compiling, building, debugging, and running a small C++ project from both VS Code and the terminal.",
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Install the compiler, build tools, debugger, CMake, and Ninja.",
            "Verify each tool from the terminal.",
            "Create a small C++ project folder.",
            "Add CMakeLists.txt at the project root.",
            "Add main.cpp under src.",
            "Build from VS Code with the CMake extension.",
            "Build from the terminal as a fallback workflow.",
          ],
        },
      ],
    },
    {
      title: "Install required packages",
      blocks: [
        {
          kind: "text",
          text: [
            "Install the standard Ubuntu C++ development tools. build-essential provides GCC, G++, make, and related compiler tools. cmake handles project configuration, gdb handles debugging, and ninja-build provides a fast build backend.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo apt update
sudo apt install -y build-essential cmake gdb ninja-build`,
        },
      ],
    },
    {
      title: "Verify installation",
      blocks: [
        {
          kind: "text",
          text: [
            "Check that the compiler, CMake, debugger, and Ninja are available from the shell.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `g++ --version
cmake --version
gdb --version
ninja --version`,
        },
      ],
    },
    {
      title: "Create project structure",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a clean project folder. Keep CMakeLists.txt at the project root and source files under src.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/Projects/cpp/hello_cpp/src
cd ~/Projects/cpp/hello_cpp`,
        },
        {
          kind: "text",
          text: ["Target structure:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `hello_cpp/
  CMakeLists.txt
  src/
    main.cpp`,
        },
      ],
    },
    {
      title: "Create CMakeLists.txt",
      blocks: [
        {
          kind: "text",
          text: [
            "CMakeLists.txt defines the project, C++ standard, executable target, source file path, and compiler warning flags.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano CMakeLists.txt`,
        },
        {
          kind: "text",
          text: ["Paste the following:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `cmake_minimum_required(VERSION 3.16)

project(hello_cpp VERSION 1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(hello_cpp src/main.cpp)

target_compile_options(hello_cpp PRIVATE -Wall -Wextra -Wpedantic)`,
        },
        {
          kind: "text",
          bullets: [
            "CMAKE_CXX_STANDARD sets the language version.",
            "CMAKE_CXX_STANDARD_REQUIRED prevents silent downgrade to an older standard.",
            "CMAKE_CXX_EXTENSIONS OFF keeps the build closer to standard C++ instead of compiler-specific extensions.",
            "target_compile_options adds useful warning flags for daily development.",
          ],
        },
      ],
    },
    {
      title: "Create main.cpp",
      blocks: [
        {
          kind: "text",
          text: [
            "Create the first source file under src. This confirms that the compiler, CMake target, and build path work end to end.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano src/main.cpp`,
        },
        {
          kind: "text",
          text: ["Paste the following:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `#include <iostream>

int main() {
    std::cout << "Hello from C++ on Ubuntu" << std::endl;
    return 0;
}`,
        },
      ],
    },
    {
      title: "VS Code extensions",
      blocks: [
        {
          kind: "text",
          text: [
            "For the VS Code workflow, install the Microsoft C++ extension and the CMake Tools extension. The C++ extension provides language support and debugging. CMake Tools provides configure, build, kit selection, and target actions.",
          ],
        },
        {
          kind: "table",
          headers: ["Extension", "Purpose"],
          rows: [
            ["C/C++", "C++ IntelliSense, navigation, and debugging support"],
            ["CMake Tools", "CMake configure, build, kit selection, and target workflow"],
          ],
        },
      ],
    },
    {
      title: "Open project in VS Code",
      blocks: [
        {
          kind: "text",
          text: [
            "Open the project root in VS Code. The project root is the folder that contains CMakeLists.txt.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/Projects/cpp/hello_cpp
code .`,
        },
      ],
    },
    {
      title: "VS Code CMake workflow",
      blocks: [
        {
          kind: "text",
          text: [
            "Use the Command Palette to configure and build the project through CMake Tools.",
          ],
          bullets: [
            "Open ~/Projects/cpp/hello_cpp in VS Code.",
            "Open the Command Palette.",
            "Run CMake: Select a Kit.",
            "Choose a GCC kit.",
            "Run CMake: Configure.",
            "Run CMake: Build.",
            "Run the compiled binary from the integrated terminal.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `./build/hello_cpp`,
        },
      ],
    },
    {
      title: "Terminal workflow",
      blocks: [
        {
          kind: "text",
          text: [
            "Use the terminal workflow when VS Code configuration is not needed or when checking whether the project builds outside the editor.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/Projects/cpp/hello_cpp

cmake -S . -B build
cmake --build build
./build/hello_cpp`,
        },
      ],
    },
    {
      title: "Terminal workflow with Ninja",
      blocks: [
        {
          kind: "text",
          text: [
            "Ninja can be selected explicitly as the CMake generator. This keeps builds fast and makes the selected build backend clear.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/Projects/cpp/hello_cpp

cmake -S . -B build -G Ninja
cmake --build build
./build/hello_cpp`,
        },
      ],
    },
    {
      title: "Clean and rebuild",
      blocks: [
        {
          kind: "text",
          text: [
            "Delete the build folder when CMake cache, compiler settings, or generator selection needs to be reset.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/Projects/cpp/hello_cpp

rm -rf build
cmake -S . -B build -G Ninja
cmake --build build
./build/hello_cpp`,
        },
      ],
    },
    {
      title: "Debug build",
      blocks: [
        {
          kind: "text",
          text: [
            "Use Debug build type when stepping through the program with GDB or VS Code debugger.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/Projects/cpp/hello_cpp

cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Debug
cmake --build build`,
        },
      ],
    },
    {
      title: "Run with GDB",
      blocks: [
        {
          kind: "text",
          text: [
            "After building in Debug mode, open the compiled binary with GDB.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `gdb ./build/hello_cpp`,
        },
        {
          kind: "text",
          text: ["Common GDB commands for a first check:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `break main
run
next
continue
quit`,
        },
      ],
    },
    {
      title: "Expected output",
      blocks: [
        {
          kind: "text",
          text: [
            "A successful build and run should print the hello message from main.cpp.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Hello from C++ on Ubuntu`,
        },
      ],
    },
    {
      title: "Common mistakes",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Opening the src folder in VS Code instead of the project root that contains CMakeLists.txt.",
            "Forgetting to run CMake: Select a Kit before configure.",
            "Running ./build/hello_cpp before building the target.",
            "Changing CMakeLists.txt but not reconfiguring the project.",
            "Expecting CMake to find a source file that is not listed in add_executable.",
            "Mixing old CMake cache files with a different generator. Remove build and configure again.",
          ],
        },
      ],
    },
    {
      title: "Daily reference commands",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# verify tools
g++ --version
cmake --version
gdb --version
ninja --version

# configure
cmake -S . -B build -G Ninja

# build
cmake --build build

# run
./build/hello_cpp

# clean rebuild
rm -rf build
cmake -S . -B build -G Ninja
cmake --build build

# debug build
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Debug
cmake --build build

# run debugger
gdb ./build/hello_cpp`,
        },
      ],
    },
  ],
}

export default entry