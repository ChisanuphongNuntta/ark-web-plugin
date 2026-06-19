cmake_minimum_required(VERSION 3.16)
project(HeartShop VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# ARK Server API Path
set(ARK_SERVER_API_DIR "${CMAKE_CURRENT_SOURCE_DIR}/deps/ArkServerApi" CACHE PATH "Path to ARK Server API")

# Full plugin sources
set(SOURCES
    src/HeartShop.cpp
    src/HeartShop.h
    src/Commands.cpp
    src/Commands.h
    src/HttpClient.cpp
    src/HttpClient.h
    src/GameThreadDispatcher.cpp
    src/GameThreadDispatcher.h
    src/DeliveryJournal.cpp
    src/DeliveryJournal.h
    src/WalletNotifications.cpp
    src/WalletNotifications.h
    src/Config.cpp
    src/Config.h
    src/Protection.cpp
    src/Protection.h
)

# Create DLL
add_library(HeartShop SHARED ${SOURCES})

# Compiler definitions
target_compile_definitions(HeartShop PRIVATE
    _UNICODE
    UNICODE
    WIN32_LEAN_AND_MEAN
    NOMINMAX
)

if(MSVC)
    target_compile_options(HeartShop PRIVATE
        /utf-8
    )

    # Remove volatile linker timestamps so identical inputs can produce the
    # same PE image. The packaging script records a SHA-256 for verification.
    target_link_options(HeartShop PRIVATE /Brepro)
endif()

# Include directories
target_include_directories(HeartShop PRIVATE
    ${ARK_SERVER_API_DIR}/include
    ${ARK_SERVER_API_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/deps/json-3.12.0/single_include
    ${CMAKE_CURRENT_SOURCE_DIR}/deps
)

# Link libraries
target_link_directories(HeartShop PRIVATE
    ${ARK_SERVER_API_DIR}/lib
)

target_link_libraries(HeartShop PRIVATE
    ArkApi
)

# Output settings
set_target_properties(HeartShop PROPERTIES
    OUTPUT_NAME "HeartShop"
    SUFFIX ".dll"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
    RUNTIME_OUTPUT_DIRECTORY_DEBUG "${CMAKE_BINARY_DIR}/bin/Debug"
    RUNTIME_OUTPUT_DIRECTORY_RELEASE "${CMAKE_BINARY_DIR}/bin/Release"
    RUNTIME_OUTPUT_DIRECTORY_RELWITHDEBINFO "${CMAKE_BINARY_DIR}/bin/RelWithDebInfo"
    RUNTIME_OUTPUT_DIRECTORY_MINSIZEREL "${CMAKE_BINARY_DIR}/bin/MinSizeRel"
)

# Keep the runtime bundle together for every configuration. These files are
# copied after compilation so config changes do not require reconfiguration.
add_custom_command(TARGET HeartShop POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/config.json"
        "$<TARGET_FILE_DIR:HeartShop>/config.json"
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/PluginInfo.json"
        "$<TARGET_FILE_DIR:HeartShop>/PluginInfo.json"
    VERBATIM
)

include(CTest)
if(BUILD_TESTING)
    add_executable(DeliveryJournalTests
        tests/DeliveryJournalTests.cpp
        src/DeliveryJournal.cpp
        src/DeliveryJournal.h
    )
    target_include_directories(DeliveryJournalTests PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/deps/json-3.12.0/single_include
    )
    if(MSVC)
        target_compile_options(DeliveryJournalTests PRIVATE /utf-8)
        target_link_options(DeliveryJournalTests PRIVATE /Brepro)
    endif()
    add_test(NAME DeliveryJournalTests COMMAND DeliveryJournalTests)

    add_executable(WalletNotificationsTests
        tests/WalletNotificationsTests.cpp
        src/WalletNotifications.cpp
        src/WalletNotifications.h
    )
    target_include_directories(WalletNotificationsTests PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/deps/json-3.12.0/single_include
    )
    if(MSVC)
        target_compile_options(WalletNotificationsTests PRIVATE /utf-8)
        target_link_options(WalletNotificationsTests PRIVATE /Brepro)
    endif()
    add_test(NAME WalletNotificationsTests COMMAND WalletNotificationsTests)
endif()
