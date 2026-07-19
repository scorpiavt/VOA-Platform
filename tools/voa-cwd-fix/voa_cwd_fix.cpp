// AAA_VoaCwdFix — sets process CWD to the game root before other SKSE plugins load.
// Address Library / SkyrimPlatform open "Data/SKSE/Plugins/versionlib-*.bin" relative to CWD.
#include <Windows.h>
#include <cstdint>

// SKSE 2.x PluginVersionData (SKSEPlugin_Version export) — no Address Library needed.
struct SKSEPluginVersionData
{
  enum { kVersion = 1 };
  enum {
    kVersionIndependent_AddressLibraryPostAE = 1 << 0,
    kVersionIndependent_Signatures = 1 << 1,
    kVersionIndependent_StructsPost629 = 1 << 2,
  };
  std::uint32_t dataVersion;
  std::uint32_t pluginVersion;
  char name[256];
  char author[256];
  char supportEmail[252];
  std::uint32_t versionIndependence;
  std::uint32_t compatibleVersions[16];
  std::uint32_t seVersionRequired;
};

static void SetCwdToGameRoot()
{
  wchar_t exePath[MAX_PATH] = {};
  if (!GetModuleFileNameW(nullptr, exePath, MAX_PATH)) {
    return;
  }
  // Strip filename -> directory of SkyrimSE.exe
  wchar_t* lastSlash = nullptr;
  for (wchar_t* p = exePath; *p; ++p) {
    if (*p == L'\\' || *p == L'/') lastSlash = p;
  }
  if (!lastSlash) return;
  *lastSlash = L'\0';
  SetCurrentDirectoryW(exePath);

  // Log for diagnosis
  wchar_t logDir[MAX_PATH] = {};
  if (GetEnvironmentVariableW(L"USERPROFILE", logDir, MAX_PATH)) {
    wchar_t logPath[MAX_PATH] = {};
    wsprintfW(logPath, L"%s\\Documents\\My Games\\Skyrim Special Edition\\SKSE\\voa-cwd-fix.log", logDir);
    HANDLE h = CreateFileW(logPath, GENERIC_WRITE, FILE_SHARE_READ, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h != INVALID_HANDLE_VALUE) {
      char msg[1024];
      char narrow[MAX_PATH];
      WideCharToMultiByte(CP_UTF8, 0, exePath, -1, narrow, MAX_PATH, nullptr, nullptr);
      int n = wsprintfA(msg, "VOA CwdFix: SetCurrentDirectory to:\r\n%s\r\n", narrow);
      DWORD w;
      WriteFile(h, msg, (DWORD)n, &w, nullptr);
      CloseHandle(h);
    }
  }
}

BOOL APIENTRY DllMain(HMODULE hModule, DWORD reason, LPVOID)
{
  if (reason == DLL_PROCESS_ATTACH) {
    DisableThreadLibraryCalls(hModule);
    SetCwdToGameRoot();
  }
  return TRUE;
}

extern "C" __declspec(dllexport) SKSEPluginVersionData SKSEPlugin_Version = {
  SKSEPluginVersionData::kVersion,
  1,
  "VOA CwdFix",
  "Visions of Aetherius",
  "",
  SKSEPluginVersionData::kVersionIndependent_Signatures, // no Address Library
  { 0 },
  0
};

extern "C" __declspec(dllexport) bool SKSEPlugin_Load(void*)
{
  // Re-assert in case something changed CWD between attach and load
  SetCwdToGameRoot();
  return true;
}
