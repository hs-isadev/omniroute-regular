' GUI-hosted launcher: no terminal, wait for Node, preserve its exit code.
Option Explicit
On Error Resume Next
Dim shell, command, result
If WScript.Arguments.Count <> 2 Then WScript.Quit 2
If InStr(WScript.Arguments(0), Chr(34)) > 0 Then WScript.Quit 2
If InStr(WScript.Arguments(1), Chr(34)) > 0 Then WScript.Quit 2
Set shell = CreateObject("WScript.Shell")
If Err.Number <> 0 Then WScript.Quit 1
command = Chr(34) & WScript.Arguments(0) & Chr(34) & " " & Chr(34) & WScript.Arguments(1) & Chr(34)
result = shell.Run(command, 0, True)
If Err.Number <> 0 Then WScript.Quit 1
WScript.Quit result
