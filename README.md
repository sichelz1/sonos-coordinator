# sonos-coordinator
This is a zero configuration controller widget for OpenHAB MainUI to control Sonos devices using the OpenHAB Sonos Binding.
The coordinator consists of the `sonos_coordinator_rule.js` file, which contains all the logik and the `sonos_coordinator_widget.yaml` which contains the widget itself.

## Requirements:
- At least OpenHAB 3.2 or higher
- OpenHAB Sonos binding
- The JSRuntime plugin needs to be installed

## Installation
1. Download the `sonos_coordinator_rule.js` file and copy it into the `./conf/automation/js` folder of your OpenHAB installation. 
2. Create a new widget and copy the code from the the `sonos_coordinator_widget.yaml` into your new widget.
3. Place the widget on a page you like

## Features
- Automatically display all Zone Players within an oh-swiper card.
- Control the volume of the zone as well as the individual volume of all grouped players within the zone.
- Control the mute state of the zone as well as the individual mute state of all grouped players within the zone.
- Add or remove players from/to the the current zone player
- Control the state of the zone player (Play/Pause/Next/Previouse)
- Display the cover art of the currently played track of the zone player
- Display title, artist and album information of the currently played track of the zone player
- If the title or artist information is lacking (e.g. when listening to a radio station), the widget tries to parse the information from the track item 
  (although not 100% reliable, this works for the german radio stations i am listening to).
- Change the caption for title, artist, album, volume configuration and group configuration (for internationalization) in the configuration of the widget (default is english)
- Responsive design of the widget (works well on tablets, mobile phones and desktop browsers)

## How it works
The rule will initialize itself as soon as it is copied into the correct destination folder. It will automatically search for all available sonos Things within the
Openhab ThingRegistry. After the discovery, it will check all required channels of the Things for bound items. If a required channel is not yet bound to an item, 
the rule will automatically create a "proxy" item and bind it to the channel (although i prefer creating the items manually and adding them properly to the model of OpenHAB,
you wouldn't need to as the rule will create everything you need for the widget to run properly).
Futhermore, the rule will create "proxy" items with informations for the widget, for controlling the zone volume, zone mute and grouping functionality of your 
sonos system as well as the required rules within OpenHAB to properly synchronize on state changes.
If the rule should be removed from the `./conf/automation/js`, it will automatically delete all items and rules that have been created by the rule upon removal.

## Issues/limitations
- The rule does currently not detect if you add or remove a sonos thing to OpenHAB (you need to refresh the rule by either removing and adding the rule again or 
  by restarting OpenHAB). Maybe i'll add support for this later on.
- When editing you page in OpenHAB, the widget will show up slots to add additional widgets or to configure subelements (this seems to be an OpenHAB behavior of which i haven't yet found out how to turn off
  for a custom widget).
