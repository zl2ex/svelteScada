import { Controller, Tag } from 'st-ethernet-ip';
 
const PLC = new Controller();
 
// Add some tags to group
PLC.subscribe(new Tag("_20TT01"));
//PLC.subscribe(new Tag("progTag", "prog")); // Program Scope Tag in PLC Program "prog"
 
PLC.connect("172.16.2.10", 0).then(() => {
    // Set Scan Rate of Subscription Group to 50 ms (defaults to 200 ms)
    PLC.scan_rate = 50;
 
    // Begin Scanning
    PLC.scan();
});
 
// Catch the Tag "Changed" and "Initialized" Events
PLC.forEach(tag => {
    // Called on the First Successful Read from the Controller
    tag.on("Initialized", tag => {
        console.log("Initialized", tag.tagname, tag.value);
    });
 
    // Called if Tag.controller_value changes
    tag.on("Changed", (tag, oldValue) => {
        console.log("Changed:",tag.tagname, tag.value);
    });
});