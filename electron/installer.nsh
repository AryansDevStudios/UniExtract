; Custom NSIS script for Uni Extract
; Force single-user (current user) installation and skip the "all users / current user" selection page

!define MUI_ABORTWARNING

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
  StrCpy $isForceMachineInstall "0"
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Uni Extract Setup"
  !define MUI_WELCOMEPAGE_TEXT "Setup will guide you through the installation of Uni Extract.$\r$\n$\r$\nHigh-performance media downloader and transcoder for YouTube, TikTok, Instagram, and more.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend
