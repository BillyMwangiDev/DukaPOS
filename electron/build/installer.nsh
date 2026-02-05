!include nsDialogs.nsh
!include LogicLib.nsh

# Declare variables at the global scope (top level of the included file)
Var /GLOBAL MpesaKeyText
Var /GLOBAL MpesaKeySecret
Var /GLOBAL MpesaKeyPasskey
Var /GLOBAL MpesaKeyShortcode_Handle

# Define the function that will render the custom dialog
Function nsis_prompt_mpesa_page_func
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 12u "Enter M-Pesa API Credentials (Optional)"
  Pop $0

  ${NSD_CreateLabel} 0 20u 100% 12u "Consumer Key:"
  Pop $0
  ${NSD_CreateText} 0 32u 100% 12u ""
  Pop $MpesaKeyText

  ${NSD_CreateLabel} 0 50u 100% 12u "Consumer Secret:"
  Pop $0
  ${NSD_CreatePassword} 0 62u 100% 12u ""
  Pop $MpesaKeySecret

  ${NSD_CreateLabel} 0 80u 100% 12u "Passkey:"
  Pop $0
  ${NSD_CreateText} 0 92u 100% 12u ""
  Pop $MpesaKeyPasskey

  ${NSD_CreateLabel} 0 110u 100% 12u "Shortcode:"
  Pop $0
  ${NSD_CreateText} 0 122u 100% 12u "174379"
  Pop $MpesaKeyShortcode_Handle

  nsDialogs::Show
FunctionEnd

# In electron-builder, Page commands can be added to the sequence by placing them at the top level
# of the include file, as long as it's not wrapped in a macro that gets called inside a function.
Page custom nsis_prompt_mpesa_page_func

# Use the customInstall macro to handle the logic after files are extracted
!macro customInstall
  ${NSD_GetText} $MpesaKeyText $0
  ${NSD_GetText} $MpesaKeySecret $1
  ${NSD_GetText} $MpesaKeyPasskey $2
  ${NSD_GetText} $MpesaKeyShortcode_Handle $3

  # Write to .env file in installation directory
  # Note: $INSTDIR is where the app is installed
  FileOpen $4 "$INSTDIR\.env" w
  FileWrite $4 "DATABASE_URL=sqlite:///./dukapos.db$\r$\n"
  FileWrite $4 "MPESA_CONSUMER_KEY=$0$\r$\n"
  FileWrite $4 "MPESA_CONSUMER_SECRET=$1$\r$\n"
  FileWrite $4 "MPESA_PASSKEY=$2$\r$\n"
  FileWrite $4 "MPESA_SHORTCODE=$3$\r$\n"
  FileWrite $4 "MPESA_ENV=sandbox$\r$\n"
  FileClose $4
!macroend
