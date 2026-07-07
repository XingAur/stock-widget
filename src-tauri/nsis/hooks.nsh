!macro NSIS_HOOK_PREINSTALL
  ${If} $INSTDIR == "$LOCALAPPDATA\${PRODUCTNAME}"
  ${AndIf} ${FileExists} "D:\"
    StrCpy $INSTDIR "D:\${PRODUCTNAME}"
  ${EndIf}

  ${If} $INSTDIR == "${PLACEHOLDER_INSTALL_DIR}"
  ${AndIf} ${FileExists} "D:\"
    StrCpy $INSTDIR "D:\${PRODUCTNAME}"
  ${EndIf}

  SetOutPath "$INSTDIR"
!macroend
