' Checks whether each media file is fully available for this TV before it is
' allowed on screen. Roku streams from the server (its local storage quota is
' too small for FullHD videos), so "ready" here means the server answered a
' ranged request with the complete file size — enough to guarantee the item
' will not stall on air. Files still being uploaded/optimised simply stay out
' of the rotation until they are ready.
sub init()
    m.top.functionName = "loop"
end sub

sub loop()
    while true
        urls = m.top.urls
        if urls <> invalid and urls.Count() > 0
            ready = m.top.ready
            if ready = invalid then ready = {}
            pending = 0
            for each url in urls
                if ready[url] <> true
                    if probe(url)
                        ready[url] = true
                        ' Publish as soon as each file becomes usable.
                        m.top.ready = ready
                    else
                        pending = pending + 1
                    end if
                end if
            end for
            if pending = 0 then sleep(5000) else sleep(3000)
        else
            sleep(2000)
        end if
    end while
end sub

function probe(url as string) as boolean
    port = CreateObject("roMessagePort")
    transfer = CreateObject("roUrlTransfer")
    transfer.SetMessagePort(port)
    transfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
    transfer.InitClientCertificates()
    transfer.SetUrl(url)
    ' Ask for the first bytes only: cheap, yet proves the object exists and is
    ' being served completely.
    transfer.AddHeader("Range", "bytes=0-1023")
    if not transfer.AsyncGetToString() then return false

    msg = wait(12000, port)
    if type(msg) = "roUrlEvent"
        code = msg.GetResponseCode()
        if code = 200 or code = 206 then return true
        return false
    end if

    transfer.AsyncCancel()
    return false
end function
