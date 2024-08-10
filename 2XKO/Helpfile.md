Welcome to the 2XKO Alpha Vanguard Wrapper

Included here is a quick setup guide to get you going BSOD free adventure....
But in all honestly this wrapper has been created so that Vanguard is only activated when needed, preventing unexpected issues on boot, and also to close a vector of attack for any possible attacker on your network.

You can disable Vanguard after each session, and enable it before... so I looked to automate this.

##Instructions
1. Start by pressing `Win + R` and typing `services.msc`, after pressing enter you will be presented with the services menu.
2. Right-Click the VGC service, go to `Properties` and in the `Startup` type dropdown, select the `Disabled` state. Select `Stop` the service on the left tab if you do not plan to use Vanguard now.
3. Download the Vanguard wrapper, note this is only intended for the Alpha of 2XKO at this moment in time.
4. Right-click the 2XKO shortcut, go to `Properties` and copy the contents the `Target`, and place this on line 7 in place of the placeholder. Line 7 should look similar to this;
@start "2XKO" "C:\Riot Games\Riot Client\RiotClientServices.exe" --launch-product=lion --launch-patchline=live >nul 2>&1
5. To copy the `Target` to the wrapper file you can use something as simple as notepad.
6. Execute the `VanguardWrapper.bat` file to run 2XK0 and Vanguard will be enabled.
7. The first time you run the file a warning appear, this is due to the file yet to be signed, however, all the code is open here to be viewed.

Enjoy

#Future updates

1. Get the file signed
2. Add an Icon to the file
3. Make it so the user does not need to add their custom path
4. Have Vanguard service disabled on boot by default without the user having to do this step.
5. Ensure compatibility for Beta etc. 
