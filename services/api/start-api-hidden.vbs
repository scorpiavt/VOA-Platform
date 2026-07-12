' Fully detached VOA API (no console window, survives parent exit)
Set sh = CreateObject("WScript.Shell")
Dim fso, root, node
Set fso = CreateObject("Scripting.FileSystemObject")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = root
node = "node"
' Prefer full path if available
If fso.FileExists("C:\Program Files\nodejs\node.exe") Then
  node = "C:\Program Files\nodejs\node.exe"
End If
sh.Run """" & node & """ dist\index.js", 0, False
