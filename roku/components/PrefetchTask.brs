' Downloads playlist media into the Roku local temporary filesystem before the
' item is allowed on screen. Network I/O runs only in this Task, never on the
' SceneGraph render thread.
sub init()
    m.top.functionName = "loop"
    CreateDirectory("tmp:/mdi360-cache")
end sub

sub loop()
    while true
        entries = m.top.entries
        if entries <> invalid and entries.Count() > 0
            ready = m.top.ready
            if ready = invalid then ready = {}
            paths = m.top.paths
            if paths = invalid then paths = {}
            pending = 0
            desired = {}
            for each entry in entries
                if entry.id = invalid or entry.url = invalid or entry.path = invalid then continue for
                desired[entry.path] = true
                if ready[entry.id] <> true or not fileExists(entry.path)
                    DeleteFile(entry.path)
                    if download(entry.url, entry.path)
                        ready[entry.id] = true
                        paths[entry.id] = entry.path
                        m.top.ready = ready
                        m.top.paths = paths
                    else
                        ready[entry.id] = false
                        pending = pending + 1
                    end if
                end if
            end for
            pruneCache(desired)
            if pending = 0 then sleep(5000) else sleep(3000)
        else
            pruneCache({})
            sleep(2000)
        end if
    end while
end sub

function fileExists(path as string) as boolean
    fs = CreateObject("roFileSystem")
    return fs.Stat(path) <> invalid
end function

function download(url as string, path as string) as boolean
    port = CreateObject("roMessagePort")
    transfer = CreateObject("roUrlTransfer")
    transfer.SetMessagePort(port)
    transfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
    transfer.InitClientCertificates()
    transfer.SetUrl(url)
    if not transfer.AsyncGetToFile(path) then return false

    ' Full files can be large; this wait runs in the Task and never blocks UI.
    msg = wait(120000, port)
    if type(msg) = "roUrlEvent"
        code = msg.GetResponseCode()
        if code >= 200 and code < 300 and fileExists(path) then return true
    end if

    transfer.AsyncCancel()
    DeleteFile(path)
    return false
end function

sub pruneCache(desired as object)
    files = ListDir("tmp:/mdi360-cache")
    if files = invalid then return
    for each fileName in files
        path = "tmp:/mdi360-cache/" + fileName
        if desired[path] <> true then DeleteFile(path)
    end for
end sub
