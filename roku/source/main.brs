' Entry point of the MDI 360 Roku channel.
' Keeps the video/screen awake and hands everything to the SceneGraph scene.
sub Main()
    screen = CreateObject("roSGScreen")
    port = CreateObject("roMessagePort")
    screen.setMessagePort(port)

    scene = screen.CreateScene("PlayerScene")
    screen.show()

    ' Digital signage must never sleep or show the screensaver.
    device = CreateObject("roDeviceInfo")
    device.EnableAppFocusEvent(true)

    while true
        msg = wait(0, port)
        if type(msg) = "roSGScreenEvent"
            if msg.isScreenClosed() then return
        end if
    end while
end sub