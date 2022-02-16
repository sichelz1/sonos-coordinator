const controllerGroupName = "SonosControllerGroup";
const proxyItemTagName = "SonosProxyItem";
const coordinatorProxyItemTagName = "SonosCoordinatorProxyItem";
const zoneVolumeProxyItemTagName = "ZoneVolume_SonosProxyItem";
const groupSwitcherItemTagName = "GroupSwitcher_SonosProxyItem";
const zoneMuteProxyItemTagName = "ZoneMute_SonosProxyItem";

const channelIds = {
    playerChannelId : "control",
    albumChannelId : "currentalbum",
    artistChannelId: "currentartist",
    coverArtChannelId : "currentalbumart",
    coverArtChannelUrlId : "currentalbumarturl",
    titleChannelId : "currenttitle",
    masterChannelId : "coordinator",
    localMasterChannelId : "localcoordinator",
    volumeChannelId : "volume",
    zoneNameChannelId : "zonename",
    addChannelId : "add",
    removeChannelId : "remove",
    standaloneChannelId : "standalone",
    trackChannelId : "currenttrack",
    muteChannelId : "mute",
    favoriteChannelId: "favorite"
};

const services = {
    channelLinkRegistry : osgi.getService("org.openhab.core.thing.link.ItemChannelLinkRegistry"),    
    thingRegistry : osgi.getService("org.openhab.core.thing.ThingRegistry"),
    managedLinkProvider : osgi.getService("org.openhab.core.thing.link.ManagedItemChannelLinkProvider")
}

const constants = {
    sonosIdentifierString : "RINCON_"
}

const ItemChannelLink = Java.type("org.openhab.core.thing.link.ItemChannelLink");

var createItemChannelLink = function(itemName, channel) {
    console.log("Linking item " + itemName + " to channel " + channel.getUID());
    var link = new ItemChannelLink(itemName, channel.getUID());
    services.managedLinkProvider.add(link);
    console.log("Link: " + link);
}   

var getChannelUidFromItem = function(item){
    let foundChannels = Array.from(services.channelLinkRegistry.getBoundChannels(item.name));
    return foundChannels.find(channel => channel.getThingUID().getId().includes(constants.sonosIdentifierString));  
}

var getItemBoundToChannel = function(thingUidString, channelIdString){
    var item = items.getItemsByTag().find(item => {    
        let channelUid = getChannelUidFromItem(item);
        if(channelUid === undefined) return null;    
        return channelUid.getThingUID().getId() === thingUidString && channelUid.getId() === channelIdString;
    });
    if(item === undefined){
        return null;
    }
    return item;
}

var getAllSonosThings = function(){
    let foundThings =  Array.from(services.thingRegistry.getAll());
    return foundThings.filter(thing => thing.getUID().getId().startsWith(constants.sonosIdentifierString));
}

var itemExists = function(itemName){
    return items.getItem(itemName, true) !== null;
}

class SonosCoordinator{

    constructor(){
        this.group = itemExists(controllerGroupName) ? items.getItem(controllerGroupName) : items.addItem(controllerGroupName, "Group", undefined, undefined, undefined, new Array(proxyItemTagName));

        this.allSonosThings = getAllSonosThings().map(thing => new SonosThing(thing, this.onZoneVolumeChanged, this.onVolumeChanged));
        
        var coordinatorTriggerArray = new Array();
        var volumeTriggerArray = new Array();
        var zoneVolumeTriggerArray = new Array();
        var groupSwitchTriggerArray = new Array();
        var muteTriggerArray = new Array();
        var zoneMuteTriggerArray = new Array();

        this.allSonosThings.forEach(sonosThing => {
            coordinatorTriggerArray.push(triggers.ItemStateChangeTrigger(sonosThing.allThingItemNames[channelIds.localMasterChannelId]));
            coordinatorTriggerArray.push(triggers.ItemStateChangeTrigger(sonosThing.allThingItemNames[channelIds.masterChannelId]));
            muteTriggerArray.push(triggers.ItemStateChangeTrigger(sonosThing.allThingItemNames[channelIds.muteChannelId]));

            volumeTriggerArray.push(triggers.ItemStateChangeTrigger(sonosThing.allThingItemNames[channelIds.volumeChannelId]));

            zoneVolumeTriggerArray.push(triggers.ItemCommandTrigger(sonosThing.zoneVolumeItemName));

            groupSwitchTriggerArray.push(triggers.ItemCommandTrigger(sonosThing.groupSwitcherItemName));            
           
            zoneMuteTriggerArray.push(triggers.ItemCommandTrigger(sonosThing.zoneMuteItemName));
        });


        this.updatingItems = {};
        
        if(!itemExists(coordinatorProxyItemTagName)){
            items.addItem(coordinatorProxyItemTagName, "String", undefined, new Array(controllerGroupName), undefined, new Array(proxyItemTagName, coordinatorProxyItemTagName));
        } 

        this.updateCoordinatorProxyItems();

        rules.JSRule({
            name: "A coordinator item has changed",
            description: "This rule refreshes the coordinator proxy items, when a coordinator item has changed",
            triggers: coordinatorTriggerArray,
            execute: data => {
                console.log("Entering rule A coordinator item has changed for item " + data.itemName);
                this.updateCoordinatorProxyItems();
            }
        });        


        rules.JSRule({
            name: "A zone volume proxy item received a command",
            description: "Adjusts the volume of volume items in the group according to the delta of the zone volume proxy item",
            triggers: zoneVolumeTriggerArray,
            execute: data => {
                console.log("Rule Zone volume proxy " + data.itemName + "received command started!");
                var changedThing = this.getSonosThingFromItemName(data.itemName);

                if(changedThing === undefined){
                    console.log("Did not find a thing for the changed item " + data.itemName + ". Therefor the rule will be ignored!");
                    return;
                }

                this.onZoneVolumeChanged(changedThing);
            }
        });        

        rules.JSRule({
            name: "A volume item received a command",
            description: "Adjusts the volume of the zone volume in the group according to the delta of the volume item",
            triggers: volumeTriggerArray,
            execute: data => {
                console.log("Rule Volume item " + data.itemName + " received command started!");
                var changedThing = this.getSonosThingFromItemName(data.itemName);
                if(changedThing === undefined){
                    console.log("Did not find a thing for the changed item " + data.itemName + ". Therefor the rule will be ignored!");
                    return;
                }
                this.onVolumeChanged(changedThing);
            }
        }); 

        rules.JSRule({
            name: "A group switch item received a command",
            description: "Rearanges the sonos group according to the configuration of the group switch item",
            triggers: groupSwitchTriggerArray,
            execute: data => {
                console.log("Rule group switch item " + data.itemName + " received command started!");
                var changedThing = this.getSonosThingFromItemName(data.itemName);

                if(changedThing === undefined){
                    console.log("Did not find a thing for the changed item " + data.itemName + ". Therefor the rule will be ignored!");
                    return;
                }

                this.onGroupSwitched(changedThing);
            }
        }); 

        rules.JSRule({
            name: "A mute item received a command",
            description: "Synchronizes the mute state with of zone mute state",
            triggers: muteTriggerArray,
            execute: data => {
                console.log("Rule mute item " + data.itemName + " received command started!");
                var changedThing = this.getSonosThingFromItemName(data.itemName);
                
                if(changedThing === undefined){
                    console.log("Did not find a thing for the changed item " + data.itemName + ". Therefor the rule will be ignored!");
                    return;
                }                

                this.onMuteChanged(changedThing);
            }
        }); 

        rules.JSRule({
            name: "A zone mute item received a command",
            description: "Synchronizes the mute the zone mute state with all sone mute items",
            triggers: zoneMuteTriggerArray,
            execute: data => {
                console.log("Rule zone mute item " + data.itemName + " received command started!");
                var changedThing = this.getSonosThingFromItemName(data.itemName);

                if(changedThing === undefined){
                    console.log("Did not find a thing for the changed item " + data.itemName + ". Therefor the rule will be ignored!");
                    return;
                }

                this.onGroupMuteChanged(changedThing);
            }
        });         

    }

    onZoneVolumeChanged(sonosThing){
        console.log("Zone volume for " + sonosThing.thing.getLabel() + " changed.");
        if(this.wasOwnUpdate(sonosThing.zoneVolumeItemName)){
            return;
        }
        if(!sonosThing.isZoneCoordinator()){
            console.log("Returning from onZoneVolumeChanged as the thing is not a zone coordinator!");
            return
        }        

        var allGroupedThings = this.allSonosThings.filter(st => st.getMasterId() === sonosThing.thing.getUID().getId());

        var groupedAvgVolume = 0.0;
        allGroupedThings.forEach(gt => {
            groupedAvgVolume += gt.getVolume(); 
        })

        groupedAvgVolume = groupedAvgVolume / allGroupedThings.length;

        var delta = Math.round(sonosThing.getZoneVolume() - groupedAvgVolume);
        console.log("Groupe avg volume is " + groupedAvgVolume + ". Calculated delta is " + delta);

        if(delta === 0){
            return;
        }

        allGroupedThings.forEach(st => {
            var newValue = st.getVolume() + delta;
            if(newValue > 100.0){
                newValue = 100.0;
            }
            if(newValue < 0.0){
                newValue = 0.0;
            }
            this.setNewVolume(st.allThingItemNames[channelIds.volumeChannelId], newValue)
        });
    }

    onVolumeChanged(sonosThing){
        console.log("Volume for " + sonosThing.thing.getLabel() + " changed.");
        if(this.wasOwnUpdate(sonosThing.allThingItemNames[channelIds.volumeChannelId])){
            return;
        }        
        var masterThing = this.allSonosThings.find(st => st.thing.getUID().getId() === sonosThing.getMasterId());

        var newVolume = 0.0;
        var allSonosThingsInGroup = this.allSonosThings.filter(st => st.getMasterId() === masterThing.thing.getUID().getId());
        allSonosThingsInGroup.forEach(st => newVolume += st.getVolume());
        newVolume = Math.round(newVolume / allSonosThingsInGroup.length);
        this.setNewVolume(masterThing.zoneVolumeItemName, newVolume);
    }

    onGroupSwitched(sonosThing){
        var groupConfigurationString = items.getItem(sonosThing.groupSwitcherItemName).state;
        console.log("A group configuration has changed: " + groupConfigurationString);
        if(!sonosThing.isZoneCoordinator()){
            console.log("Skipping group changes as thing " + sonosThing.thing.getLabel() + " is not a zone coordinator!");
            return;
        }
        var groupConfiguration =JSON.parse(groupConfigurationString);
        Object.keys(groupConfiguration).forEach(configKey =>{
            var groupThing = this.allSonosThings.find(st => st.thing.getUID().getId() === configKey);
            if(groupThing === undefined){
                return;
            }
            if(groupConfiguration[configKey]){
                console.log("Adding " + groupThing.thing.getLabel() + " to group of " + sonosThing.thing.getLabel());
                items.getItem(sonosThing.allThingItemNames[channelIds.addChannelId]).sendCommand(groupThing.thing.getUID().getId());
            }
            else{
                console.log("Removing " + groupThing.thing.getLabel() + " from group of " + sonosThing.thing.getLabel());                
                items.getItem(groupThing.allThingItemNames[channelIds.standaloneChannelId]).sendCommand("ON");
            }
        });

    }

    onMuteChanged(sonosThing){
        console.log("Mute for " + sonosThing.thing.getLabel() + " changed.");        
        if(this.wasOwnUpdate(sonosThing.allThingItemNames[channelIds.muteChannelId])){
            console.log("returning as the muted/unmuted sonos device was triggered by this rule");
            return;
        }
        var masterThing = this.allSonosThings.find(st => st.thing.getUID().getId() === sonosThing.getMasterId());
        
        var muteValue = this.getZoneMuteState(masterThing);
        this.setMute(masterThing.zoneMuteItemName, muteValue);
    }

    getZoneMuteState(sonosThing){
        var unmutedThingFound = false;
        this.getAllGroupedSonosThings(sonosThing).forEach(gt => {
            if(unmutedThingFound){
                return;
            }
            unmutedThingFound = items.getItem(gt.allThingItemNames[channelIds.muteChannelId]).state === "OFF";
        });

        return unmutedThingFound ? "OFF" : "ON";
    }

    onGroupMuteChanged(sonosThing){
        if(!sonosThing.isZoneCoordinator()){
            console.log("returning as the muted/unmuted sonos device is not a zone coordinator");
            return;
        }
        if(this.wasOwnUpdate(sonosThing.zoneMuteItemName)){
            console.log("returning as the muted/unmuted sonos zone device was triggered by this rule");
            return;
        }

        var groupedThings = this.getAllGroupedSonosThings(sonosThing);
        var muteState = items.getItem(sonosThing.zoneMuteItemName).state;
        console.log("Setting mute state to " + muteState + " of all grouped sonos players of from zone coordinator " +sonosThing.thing.getLabel());
        groupedThings.forEach(gt => {
            var muteItemName = gt.allThingItemNames[channelIds.muteChannelId];
            this.setMute(muteItemName, muteState);
        });
    }

    setMute(itemName, muteValue){        
        var item = items.getItem(itemName);
        
        if(item.state === muteValue){
            return;
        }
        this.updatingItems[itemName] = muteValue;
        console.log("Setting mute of item " + item.name + " to " + muteValue);
        item.sendCommand(muteValue);
    }

    getSonosThingFromItemName(itemName){
        return this.allSonosThings.find(sonosThing => Object.keys(sonosThing.allThingItemNames).some(key => sonosThing.allThingItemNames[key] === itemName) || sonosThing.groupSwitcherItemName === itemName || sonosThing.zoneVolumeItemName === itemName || sonosThing.zoneMuteItemName === itemName);
    }

    wasOwnUpdate(itemName){
        if(this.updatingItems.hasOwnProperty(itemName)){
            console.log("Removing " + itemName + " from updating items as its target and returning true for wasOwnUpdate");
            delete this.updatingItems[itemName];
            return true;
        }        
        return false;        
    }

    setNewVolume(itemName, newVolume){
        var itemVolume = parseFloat(items.getItem(itemName).state);
        if(itemVolume === newVolume){
            return;
        }
        console.log("Setting "+ itemName +" to new volume " + newVolume);
        this.updatingItems[itemName] = newVolume;
        items.getItem(itemName).sendCommand(newVolume);

    }

    getSonosCoordinatorProxyItemName(sonosThing){
        return sonosThing.thing.getUID().getId() + "_" + coordinatorProxyItemTagName;
    }

    getAllGroupedSonosThings(sonosThing){
        if(!sonosThing.isZoneCoordinator()){
            return Array.from(sonosThing);
        }

        return this.allSonosThings.filter(st => st.getMasterId() === sonosThing.thing.getUID().getId() || st.thing.getUID().getId() === sonosThing.thing.getUID().getId());
    }

    updateCoordinatorProxyItems(){
        var allCoordinators = this.allSonosThings.filter(sonosThing => sonosThing.isZoneCoordinator());
        var coordinatorArray = new Array();
        allCoordinators.forEach(sonosCoordinator => {
            var groupedSonosThings = Array.from(this.getAllGroupedSonosThings(sonosCoordinator));            

            var coordinatorProxyItem = {};
            coordinatorProxyItem.id = sonosCoordinator.thing.getUID().getId();
            coordinatorProxyItem.zoneVolumeItemName = sonosCoordinator.zoneVolumeItemName;
            coordinatorProxyItem.artistItemName = sonosCoordinator.allThingItemNames[channelIds.artistChannelId];
            coordinatorProxyItem.titelItemName = sonosCoordinator.allThingItemNames[channelIds.titleChannelId];
            coordinatorProxyItem.albumItemName = sonosCoordinator.allThingItemNames[channelIds.albumChannelId];
            coordinatorProxyItem.coverArtItemName = sonosCoordinator.allThingItemNames[channelIds.coverArtChannelId];
            coordinatorProxyItem.coverArtUrlItemName = sonosCoordinator.allThingItemNames[channelIds.coverArtChannelUrlId];
            coordinatorProxyItem.playerItemName = sonosCoordinator.allThingItemNames[channelIds.playerChannelId];
            coordinatorProxyItem.trackItemName = sonosCoordinator.allThingItemNames[channelIds.trackChannelId];
            coordinatorProxyItem.muteItemName = sonosCoordinator.allThingItemNames[channelIds.muteChannelId];
            coordinatorProxyItem.zoneMuteItemName = sonosCoordinator.zoneMuteItemName;
            coordinatorProxyItem.groupSwitcherItemName = sonosCoordinator.groupSwitcherItemName;
            coordinatorProxyItem.favoriteItemName = sonosCoordinator.allThingItemNames[channelIds.favoriteChannelId];

            var zoneItemNames = new Array();
            var volumeItemsInformation = new Array();
            var groupedItemsInformation = new Array();
            var groupedThingDeleteVars = new Array();
            var groupVolume = 0.0;                                   

            groupedThingDeleteVars.push(sonosCoordinator.thing.getUID().getId() + "_group");
            groupedThingDeleteVars.push(sonosCoordinator.thing.getUID().getId() + "_volume");
            groupedThingDeleteVars.push(sonosCoordinator.thing.getUID().getId() + "_favorite");

            groupedSonosThings.forEach(gt => {
                zoneItemNames.push(items.getItem(gt.allThingItemNames[channelIds.zoneNameChannelId]).state)
                var gtVolumeInformation = {};
                gtVolumeInformation.zoneItemName = gt.allThingItemNames[channelIds.zoneNameChannelId];
                gtVolumeInformation.volumeItemName = gt.allThingItemNames[channelIds.volumeChannelId];
                gtVolumeInformation.muteItemName = gt.allThingItemNames[channelIds.muteChannelId];
                volumeItemsInformation.push(gtVolumeInformation);

                groupVolume = groupVolume + gt.getVolume();

            });

            if(groupedSonosThings.length > 0)
                groupVolume = Math.round(groupVolume / groupedSonosThings.length);

            items.getItem(sonosCoordinator.zoneVolumeItemName).postUpdate(groupVolume);

            items.getItem(sonosCoordinator.zoneMuteItemName).postUpdate(this.getZoneMuteState(sonosCoordinator));

            var allOtherSonosItems = this.allSonosThings.filter(ast => {
                return ast.thing.getUID().getId() !== sonosCoordinator.thing.getUID().getId();
            });
            var idCounter = 0;
            allOtherSonosItems.forEach(aosi => {
                var groupedItemInformation = {};
                groupedItemInformation.isInGroup = groupedSonosThings.some(gst => aosi.getMasterId() === gst.thing.getUID().getId());
                groupedItemInformation.name = items.getItem(aosi.allThingItemNames[channelIds.zoneNameChannelId]).state
                groupedItemInformation.thingUid = aosi.thing.getUID().getId();
                groupedItemInformation.id = "itemInfo_" + idCounter;
                groupedItemsInformation.push(groupedItemInformation);
                groupedThingDeleteVars.push(aosi.thing.getUID().getId());
                idCounter++;
            });
            coordinatorProxyItem.zoneNames = zoneItemNames.join(" + ");
            coordinatorProxyItem.volumeInformation = volumeItemsInformation;
            coordinatorProxyItem.groupedItemsInformation = groupedItemsInformation;
            coordinatorProxyItem.groupedThingDeleteVars = groupedThingDeleteVars;
            coordinatorArray.push(coordinatorProxyItem);
        });
        items.getItem(coordinatorProxyItemTagName).sendCommand(JSON.stringify(coordinatorArray));
    }
}

class SonosThing{
    constructor(thing, onZoneVolumeChanged, onVolumeChanged){
        this.onZoneVolumeChanged = onZoneVolumeChanged;
        this.onVolumeChanged = onVolumeChanged;
        this.thing = thing;
        this.allThingItemNames = {};

        Object.keys(channelIds).forEach(key => {
            var foundItem = getItemBoundToChannel(thing.getUID().getId(), channelIds[key]);
            if(foundItem === null){
                var channel = thing.getChannel(channelIds[key]);
                var itemType = channel.getAcceptedItemType();
                this.allThingItemNames[channelIds[key]] = items.addItem(thing.getUID().getId() + "_" +  channel.getLabel() + "_" + proxyItemTagName, itemType, undefined, new Array(controllerGroupName), undefined, new Array(proxyItemTagName)).name;
                createItemChannelLink(this.allThingItemNames[channelIds[key]], channel)
            }
            else{
                this.allThingItemNames[channelIds[key]] = foundItem.name;
            }            
        });

        this.volumeItemName = this.allThingItemNames[channelIds.volumeChannelId];
        var zoneVolumeItemName = thing.getUID().getId() + "_" + zoneVolumeProxyItemTagName;
        var zoneVolumeItemType = thing.getChannel(channelIds.volumeChannelId).getAcceptedItemType();
        var zoneVolumeItem = itemExists(zoneVolumeItemName) ? items.getItem(zoneVolumeItemName) : items.addItem(zoneVolumeItemName, zoneVolumeItemType, undefined, undefined, undefined, new Array(proxyItemTagName, zoneVolumeProxyItemTagName));

        this.zoneVolumeItemName = zoneVolumeItem.name;

        var groupSwichterItemName = thing.getUID().getId() + "_" + groupSwitcherItemTagName;

        var groupSwitcherItem = itemExists(groupSwichterItemName) ? items.getItem(groupSwichterItemName) : items.addItem(groupSwichterItemName, "String", undefined, undefined, undefined, new Array(proxyItemTagName, groupSwitcherItemTagName));

        this.groupSwitcherItemName = groupSwitcherItem.name;                      

        var zoneMuteItemName = thing.getUID().getId() + "_" + zoneMuteProxyItemTagName;
        var zoneMuteItemType = thing.getChannel(channelIds.muteChannelId).getAcceptedItemType();
        var zoneMuteItem = itemExists(zoneMuteItemName) ? items.getItem(zoneMuteItemName) : items.addItem(zoneMuteItemName, zoneMuteItemType, undefined, undefined, undefined, new Array(proxyItemTagName, zoneMuteProxyItemTagName));

        this.zoneMuteItemName = zoneMuteItem.name;
    }
    isZoneCoordinator(){
        var thingName = this.allThingItemNames[channelIds.localMasterChannelId];
        var localMasterItem = items.getItem(thingName);
        return localMasterItem.state == "ON";
    }

    getMasterId(){
        
        var masterString = items.getItem(this.allThingItemNames[channelIds.masterChannelId]).state;
        if(!masterString.includes(constants.sonosIdentifierString)){
            return this.thing.getUID().getId();
        }
        return masterString;
    }

    getVolume(){
        var volume = parseFloat(items.getItem(this.allThingItemNames[channelIds.volumeChannelId]).state);
        return isNaN(volume) ? 0.0 : volume;
    }

    getZoneVolume(){
        var zoneVolume = parseFloat(items.getItem(this.zoneVolumeItemName).state);
        return isNaN(zoneVolume) ? 0.0 : zoneVolume;
    }
}

var coordinator = null;
scriptLoaded = function () {
    console.log("Sonos coordinator rule load");
    loadedDate = Date.now();
    coordinator = new SonosCoordinator();
}

scriptUnloaded = function () {
    console.log("Sonos coordinator rule unload");
    var foundItems = Array.from(items.getItemsByTag(proxyItemTagName).map(item => item.name));
    foundItems.forEach(foundItem => {
        console.log("Removing proxy item:" + foundItem)
        try {
            items.removeItem(foundItem);   
        } catch (e) {          
        }
    });
}