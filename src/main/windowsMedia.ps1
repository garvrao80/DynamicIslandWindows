$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$propertiesType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
} | Select-Object -First 1
function Wait-Result($operation, $type) {
    $task = $asTask.MakeGenericMethod($type).Invoke($null, @($operation))
    if (!$task.Wait(4000)) { throw 'Windows media session timed out' }
    return $task.Result
}
$manager = Wait-Result ($managerType::RequestAsync()) $managerType
function Get-Cover($media) {
    $key = @($media.Title, $media.Artist, $media.AlbumTitle) -join [char]31
    if ($key -eq $script:coverKey -and $script:cover) { return $script:cover }
    $script:coverKey = $key
    $script:cover = ''
    if (!$media.Thumbnail) { return '' }
    try {
        $type = [Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]
        $stream = Wait-Result ($media.Thumbnail.OpenReadAsync()) $type
        $randomAccess = [Windows.Storage.Streams.IRandomAccessStream,Windows.Storage.Streams,ContentType=WindowsRuntime]
        $size = $randomAccess.GetProperty('Size').GetValue($stream)
        if ($size -gt 0 -and $size -le 2097152) {
            $inputStream = $randomAccess.GetMethod('GetInputStreamAt').Invoke($stream, @([uint64]0))
            $method = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object {
                $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1
            }
            $reader = $method.Invoke($null, @($inputStream))
            $data = [IO.MemoryStream]::new()
            $reader.CopyTo($data)
            $bytes = $data.ToArray()
            $mime = if ($bytes[0] -eq 255 -and $bytes[1] -eq 216) { 'image/jpeg' }
                    elseif ($bytes[0] -eq 137 -and $bytes[1] -eq 80) { 'image/png' }
            if ($mime) { $script:cover = "data:$mime;base64," + [Convert]::ToBase64String($bytes) }
        }
    } catch { } finally {
        if ($reader) { $reader.Dispose() }
        if ($data) { $data.Dispose() }
    }
    return $script:cover
}
function Invoke-SessionRequest($request) {
    $sessions = @($manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -match '(?i)spotify' })
    $session = $sessions | Where-Object { $_.GetPlaybackInfo().PlaybackStatus -eq 'Playing' } | Select-Object -First 1
    if (!$session) { $session = $sessions | Select-Object -First 1 }
    if (!$session) {
        if ($request.action -eq 'read') { return @{ empty = $true } }
        throw 'Start Spotify on this PC'
    }
    switch ($request.action) {
        'read' {
            $media = Wait-Result ($session.TryGetMediaPropertiesAsync()) $propertiesType
            if (!$media.Title) { return @{ empty = $true } }
            $timeline = $session.GetTimelineProperties()
            $info = $session.GetPlaybackInfo()
            $playing = $info.PlaybackStatus -eq 'Playing'
            $duration = ($timeline.EndTime - $timeline.StartTime).TotalMilliseconds
            $position = ($timeline.Position - $timeline.StartTime).TotalMilliseconds
            if ($playing -and $duration -gt 0 -and $timeline.LastUpdatedTime.Year -gt 1970) {
                $age = ([DateTimeOffset]::UtcNow - $timeline.LastUpdatedTime).TotalMilliseconds
                $rate = $info.PlaybackRate
                if ($null -eq $rate) { $rate = 1 }
                $position += [Math]::Max(0, $age) * $rate
            }
            return @{track=$media.Title; artist=$media.Artist; album=$media.AlbumTitle; isPlaying=$playing;
                durationMs=[long][Math]::Max(0,$duration); progressMs=[long][Math]::Max(0,[Math]::Min($position,$duration));
                artworkUrl=(Get-Cover $media); canSeek=$info.Controls.IsPlaybackPositionEnabled}
        }
        'next' { $op = $session.TrySkipNextAsync() }
        'previous' { $op = $session.TrySkipPreviousAsync() }
        'play' { $op = $session.TryPlayAsync() }
        'pause' { $op = $session.TryPauseAsync() }
        'seek' { $op = $session.TryChangePlaybackPositionAsync($session.GetTimelineProperties().StartTime.Ticks + [long]$request.positionMs * 10000) }
        default { throw 'Unknown media command' }
    }
    if (!(Wait-Result $op ([bool]))) { throw 'Spotify declined this media control' }
    return @{ok=$true}
}
while ($null -ne ($line = [Console]::ReadLine())) {
    try { $result = Invoke-SessionRequest (ConvertFrom-Json $line) }
    catch { $result = @{error=$_.Exception.Message} }
    [Console]::WriteLine((ConvertTo-Json -Compress $result))
}
