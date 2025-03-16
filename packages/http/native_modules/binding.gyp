{
  "targets": [
    {
      "target_name": "thread_binding_linux",
      "conditions": [
        ['OS=="linux"', {
          "sources": [ "thread_binding_linux.cpp" ],
          "include_dirs": [
            "<!@(node -p \"require('node-addon-api').include\")"
          ],
          "dependencies": [
            "<!(node -p \"require('node-addon-api').gyp\")"
          ],
          "cflags!": [ "-fno-exceptions" ],
          "cflags_cc!": [ "-fno-exceptions" ],
          "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
        }]
      ]
    },
    {
      "target_name": "thread_binding_win32",
      "conditions": [
        ['OS=="win"', {
          "sources": [ "thread_binding_windows.cpp" ],
          "include_dirs": [
            "<!@(node -p \"require('node-addon-api').include\")"
          ],
          "dependencies": [
            "<!(node -p \"require('node-addon-api').gyp\")"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1
            }
          },
          "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
        }]
      ]
    },
    {
      "target_name": "thread_binding_darwin",
      "conditions": [
        ['OS=="mac"', {
          "sources": [ "thread_binding_macos.cpp" ],
          "include_dirs": [
            "<!@(node -p \"require('node-addon-api').include\")"
          ],
          "dependencies": [
            "<!(node -p \"require('node-addon-api').gyp\")"
          ],
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "10.14"
          },
          "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
        }]
      ]
    }
  ]
} 