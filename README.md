# homebridge-mqtt-temperature-log-tasmota

Plugin to HomeBridge optimized for work with Itead Sonoff and Electrodragon Relay Board hardware and firmware [Sonoff-Tasmota](https://github.com/arendst/Sonoff-Tasmota) via MQTT with log temperature (periodical and 24 h min. and max.) to file. It acts as a themperature monitor for DS18B20, DHT22, DHT11, AM2301, AM2302 sensors. Also works with other accessories sending the temperature as a number (payload ex. 21.1).

Like this? Please buy me a beer (or coffee) ;-) <a href="https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&amp;hosted_button_id=CK56Q7SFHEHSW"><img src="http://macwyznawca.pl/donate-paypal2.png" alt="Donate a coder" data-canonical-src="http://macwyznawca.pl/donate-paypal.svg" style="max-width:100%;"></a>

[MacWyznawca.pl](http://macwyznawca.pl) Jaromir Kopp

## Something more

Works with plugs [**[homebridge-max-temperature-log]**](https://www.npmjs.com/package/homebridge-max-temperature-log) and [**[homebridge-min-temperature-log]**](https://www.npmjs.com/package/homebridge-min-temperature-log), showing the minimum and maximum daily temperatures. 

Installation
--------------------
    sudo npm install -g homebridge-mqtt-temperature-log-tasmota

Sample HomeBridge Configuration (complete)
--------------------

{
		
    "bridge": {
        "name": "Homebridge",
        "username": "CC:22:3D:E3:CE:30",
        "port": 51826,
        "pin": "031-45-154"
    },
    
    "description": "This is an example configuration file. You can use this as a template for creating your own configuration file.",
	
    "platforms": [],
	
	"accessories": [
		{
			"accessory": "mqtt-temperature-tasmota",
			
			"name": "NAME OF THIS ACCESSORY",
	
			"url": "mqtt://MQTT-ADDRESS",
			"username": "MQTT USER NAME",
			"password": "MQTT PASSWORD",
			
			"topic": "tele/sonoff/SENSOR",
			
			"activityTopic": "tele/sonoff/LWT",
			"activityParameter": "Online",
			
			"startCmd": "cmnd/sonoff/TelePeriod",
			"startParameter": "120",
			
			"patchToSave":"/root/.homebridge/",
			"savePeriod": "15",
			"zeroHour": "23",
			
			"sensorPropertyName": "BME280_2",
			
			"manufacturer": "ITEAD",
			"model": "Sonoff TH",
			"serialNumberMAC": "MAC OR SERIAL NUMBER"
			
		}
	]
}

Sample HomeBridge Configuration (minimal)
--------------------

{
	
    "bridge": {
        "name": "Homebridge",
        "username": "CC:22:3D:E3:CE:30",
        "port": 51826,
        "pin": "031-45-154"
    },
    
    "description": "This is an example minimal configuration file. You can use this as a template for creating your own configuration file.",
	
    "platforms": [],
	
	"accessories": [
		{
			"accessory": "mqtt-temperature-tasmota",
			
			"name": "NAME OF THIS ACCESSORY",
	
			"url": "mqtt://MQTT-ADDRESS",
			"username": "MQTT USER NAME",
			"password": "MQTT PASSWORD",
			
			"topic": "tele/sonoff/SENSOR",
			
			"patchToSave":"/root/.homebridge/"
		}
	]
}

# Description of the configuration file.

**sonoff** in topic - topics name of Your Sonoff switch.

**"topic"** - telemetry topic (for sensors data)

**"activityTopic": "tele/sonoff/LWT"** - last will topic for check online state.

**"activityParameter": "Online"** - last will payload for online state.

**"startCmd": "cmnd/sonoff/TelePeriod"** -  command sent after the connection.

**"startParameter": "60"** - payload for **startCmd**.

**"patchToSave":"/root/.homebridge/"** - path to save text files with temperature data.

**"savePeriod": "15"** - period (minutes) for saving and check temperature. For save only min. and max. 24h temperature data set with "minus" ex "-15". Minimal preriod 10 minutes. Empty: save every hour.

**"zeroHour": "23"** - time (UTC) at which you want to reset the timer min./max. Empty to reset after 24 hours since the last minimum or maximum.

The files will be saved in the specified path with the "topic" (ex. Sonoff) in the file name ex. "/root/.homebridge/sonoff_temp.csv".

**"sensorPropertyName": "BME280-2"** - custom Property name for sensor (see accessory WWW console for tips:  {"Time":"2017-03-01T08:47:19", "**DHT22-2**":{"Temperature":4.6, "Humidity":71.7}})
