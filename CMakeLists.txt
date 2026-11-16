cmake_minimum_required(VERSION 3.22)

# Universal binary (Apple silicon + Intel), macOS 11 or later. Must be set before project().
set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "Minimum macOS version")
set(CMAKE_OSX_ARCHITECTURES "arm64;x86_64" CACHE STRING "Build architectures")

project(Strain VERSION 1.0.0 LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE Release)
endif()

# JUCE is downloaded at configure time. To use a local copy instead:
#   cmake -B build -DFETCHCONTENT_SOURCE_DIR_JUCE=/path/to/JUCE
include(FetchContent)
FetchContent_Declare(JUCE
  GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
  GIT_TAG 9.0.5
  GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(JUCE)

option(STRAIN_COPY_AFTER_BUILD "Install the built plugins into the user plug-in folders" ON)

if(APPLE)
  set(STRAIN_FORMATS VST3 AU Standalone)
else()
  set(STRAIN_FORMATS VST3 Standalone)
endif()

juce_add_plugin(Strain
  PRODUCT_NAME "Strain"
  COMPANY_NAME "Strain Audio"
  BUNDLE_ID "com.strainaudio.strain"
  PLUGIN_MANUFACTURER_CODE Strn
  PLUGIN_CODE Stn1
  FORMATS ${STRAIN_FORMATS}
  IS_SYNTH TRUE
  NEEDS_MIDI_INPUT TRUE
  NEEDS_MIDI_OUTPUT FALSE
  IS_MIDI_EFFECT FALSE
  EDITOR_WANTS_KEYBOARD_FOCUS TRUE
  NEEDS_WEB_BROWSER TRUE
  VST3_CATEGORIES Instrument Synth
  AU_MAIN_TYPE kAudioUnitType_MusicDevice
  COPY_PLUGIN_AFTER_BUILD ${STRAIN_COPY_AFTER_BUILD})

juce_add_binary_data(StrainUI SOURCES ui/index.html)

target_sources(Strain PRIVATE
  Source/PluginProcessor.cpp
  Source/PluginEditor.cpp)

target_compile_definitions(Strain PUBLIC
  JUCE_WEB_BROWSER=1
  JUCE_USE_CURL=0
  JUCE_VST3_CAN_REPLACE_VST2=0)

target_link_libraries(Strain
  PRIVATE
    StrainUI
    juce::juce_audio_utils
    juce::juce_gui_extra
  PUBLIC
    juce::juce_recommended_config_flags
    juce::juce_recommended_lto_flags)

# Optional headless test of the processor (no audio device or window needed):
#   cmake -B build -DSTRAIN_BUILD_TESTS=ON && cmake --build build --target StrainSmoke
option(STRAIN_BUILD_TESTS "Build the headless processor test" OFF)
if(STRAIN_BUILD_TESTS)
  juce_add_console_app(StrainSmoke PRODUCT_NAME "StrainSmoke" NEEDS_WEB_BROWSER TRUE)
  target_sources(StrainSmoke PRIVATE tools/smoke_test.cpp Source/PluginProcessor.cpp Source/PluginEditor.cpp)
  target_compile_definitions(StrainSmoke PRIVATE JUCE_WEB_BROWSER=1 JUCE_USE_CURL=0)
  target_link_libraries(StrainSmoke PRIVATE StrainUI juce::juce_audio_utils juce::juce_gui_extra juce::juce_recommended_config_flags)
endif()
