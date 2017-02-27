// Sonoff-Tasmota Temperature Sensor Accessory plugin for HomeBridge with log and min-max temp
//
// Remember to add accessory to config.json. Example:
/* 	"accessories": [
	{
		"accessory": "mqtt-temperature-log-tasmota",

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

		"manufacturer": "ITEAD",
		"model": "Sonoff TH",
		"serialNumberMAC": "MAC OR SERIAL NUMBER"

	}]
*/
// When you attempt to add a device, it will ask for a "PIN code".
// The default code for all HomeBridge accessories is 031-45-154.

var Service, Characteristic;
var mqtt = require("mqtt");

module.exports = function(homebridge) {
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory("homebridge-mqtt-temperature-log-tasmota", "mqtt-temperature-log-tasmota", TemperatureLogTasmotaAccessory);
}

function convertDateUTCDtoLocalStr(date) {
	date = new Date(date);
	var localOffset = date.getTimezoneOffset() * 60000;
	var localTime = date.getTime();
	date = localTime - localOffset;
	date = new Date(date).toISOString().replace(/T/, ' ').replace(/\..+/, '');
	return date;
}

function convertDateTofilename(date) {
	date = new Date(date);
	var localOffset = date.getTimezoneOffset() * 60000;
	var localTime = date.getTime();
	date = localTime - localOffset;
	date = new Date(date).toISOString().replace(/T.+/, '');
	return date;
}

function TemperatureLogTasmotaAccessory(log, config) {
	this.fs = require("graceful-fs");

	this.log = log;
	this.name = config["name"] || "Sonoff";
	this.manufacturer = config["manufacturer"] || "ITEAD";
	this.model = config["model"] || "Sonoff";
	this.serialNumberMAC = config["serialNumberMAC"] || "";

	this.url = config["url"];
	this.topic = config["topic"];

	this.filename = this.topic.split("/")[1];
	this.savePeriod = parseInt(config["savePeriod"]) || 60; // in minutes.
	this.savePeriod = this.savePeriod < 15 ? 14 : this.savePeriod - 1; // -1 
	this.patchToSave = config["patchToSave"] || false;
	if (this.patchToSave) {
		try {
			this.fs.statSync(this.patchToSave);
		} catch (e) {
			try {
				this.fs.statSync("/tmp/");
				this.patchToSave = "/tmp/";
			} catch (e) {
				this.patchToSave = false;
			}
		}
	}
	this.zeroHour = config["zeroHour"] || false;

	if (config["activityTopic"] !== undefined) {
		this.activityTopic = config["activityTopic"];
		this.activityParameter = config["activityParameter"];
	} else {
		this.activityTopic = "";
		this.activityParameter = "";
	}


	this.client_Id = "mqttjs_" + Math.random().toString(16).substr(2, 8);
	this.options = {
		keepalive: 10,
		clientId: this.client_Id,
		protocolId: "MQTT",
		protocolVersion: 4,
		clean: true,
		reconnectPeriod: 1000,
		connectTimeout: 30 * 1000,
		will: {
			topic: "WillMsg",
			payload: "Connection Closed abnormally..!",
			qos: 0,
			retain: false
		},
		username: config["username"],
		password: config["password"],
		rejectUnauthorized: false
	};

	this.lastSaveData = new Date;

	this.service = new Service.TemperatureSensor(this.name);
	if (this.activityTopic !== "") {
		this.service.addOptionalCharacteristic(Characteristic.StatusActive);
	}

	this.client = mqtt.connect(this.url, this.options);

	this.client.on("error", function() {
		that.log("Error event on MQTT");
	});

	// Eksperyment z wymuszaniem statusu
	this.client.on("connect", function() {
		if (config["startCmd"] !== undefined) {
			that.client.publish(config["startCmd"], config["startParameter"] !== undefined ? config["startParameter"] : "");
		}
	});

	this.client.subscribe(this.topic);
	if (this.activityTopic !== "") {
		this.client.subscribe(this.activityTopic);
	}

	var that = this;

	this.client.on("message", function(topic, message) {
		if (topic == that.topic) {
			data = JSON.parse(message);
			if (data === null) {
				return null
			}
			if (data.hasOwnProperty("DS18B20")) {
				that.temperature = parseFloat(data.DS18B20.Temperature);
			} else if (data.hasOwnProperty("DHT")) {
				that.temperature = parseFloat(data.DHT.Temperature);
			}
			that.service.setCharacteristic(Characteristic.CurrentTemperature, that.temperature);

			// Write temperature to file	
			if (that.patchToSave) {

				if (((new Date).getTime() - that.lastSaveData.getTime()) >= (Math.abs(that.savePeriod) * 60000)) {
					var zeroDate = that.zeroHour ? (new Date()).setHours(that.zeroHour, 0, 0, 0) : false;
					// min temp
					var minTmp = ["", ""];
					that.fs.readFile(that.patchToSave + that.filename + "_minTemp.txt", "utf8", function(err, data) {
						if (err) {
							minTmp = [Date(), that.temperature];
							that.fs.writeFile(that.patchToSave + that.filename + "_minTemp.txt", minTmp.join("\t"), "utf8", function(err) {
								if (err) {
									that.patchToSave = false;
									that.log("Problem with save minTemp file");
								}
							});
						} else {
							minTmp = data.split("\t");
							if (zeroDate ? new Date(minTmp[0]).getTime() - zeroDate < -86400000 : (new Date).getTime() - (new Date(minTmp[0])).getTime() > 86400000) {
								minTmp[0] = Date();
								minTmp[1] = that.temperature;
								that.fs.writeFile(that.patchToSave + that.filename + "_minTemp.txt", minTmp.join("\t"), "utf8", function(err) {
									if (err) throw err;
								});
							} else {
								if (that.temperature < minTmp[1]) {
									minTmp[1] = that.temperature;
									minTmp[0] = Date();
									that.fs.writeFile(that.patchToSave + that.filename + "_minTemp.txt", minTmp.join("\t"), "utf8", function(err) {
										if (err) throw err;
									});
								}
							}
						}
					});
					// max temp
					var maxTmp = ["", ""];
					that.fs.readFile(that.patchToSave + that.filename + "_maxTemp.txt", 'utf8', function(err, data) {
						if (err) {
							maxTmp = [Date(), that.temperature];
							that.fs.writeFile(that.patchToSave + that.filename + "_maxTemp.txt", maxTmp.join("\t"), "utf8", function(err) {
								if (err) {
									that.patchToSave = false;
									that.log("Problem with save maxTemp file");
								}
							});
						} else {
							maxTmp = data.split("\t");
							if ((new Date).getTime() - (new Date(maxTmp[0])).getTime() > 86400000) {
								maxTmp[0] = Date();
								maxTmp[1] = that.temperature;
								that.fs.writeFile(that.patchToSave + that.filename + "_minTemp.txt", minTmp.join("\t"), "utf8", function(err) {
									if (err) throw err;
								});
							} else {
								if (that.temperature > maxTmp[1]) {
									maxTmp[1] = that.temperature;
									maxTmp[0] = Date();
									that.fs.writeFile(that.patchToSave + that.filename + "_maxTemp.txt", maxTmp.join("\t"), "utf8", function(err) {
										if (err) throw err;
									});
								}
							}
						}
					});
					if (that.savePeriod > 0) {
						that.fs.stat(that.patchToSave + that.filename + "_temp.txt", function(err, stat) {
							if (err) {
								that.log("Problem with file size (temp history)");
							} else {
								if (stat.size > 77376) { // 77376 ~ 31 days by 15 min.
									that.fs.rename(that.patchToSave + that.filename + "_temp.txt", that.patchToSave + that.filename + "_temp_" + convertDateTofilename(data.Time) + ".txt", function(err) {
										if (err) that.log('ERROR change filename: ' + err);
									});
								}
							}
						});
						that.fs.appendFile(that.patchToSave + that.filename + "_temp.txt", convertDateUTCDtoLocalStr(data.Time) + "\t" + that.temperature + "\t" + "\n", "utf8", function(err) {
							if (err) {
								that.patchToSave = false;
								that.log("Problem with save file (temp history)");
							}
							that.lastSaveData = new Date;
						});
					}
				}
			}
		} else if (topic == that.activityTopic) {
			var status = message.toString();
			that.activeStat = (status == that.activityParameter);
			that.service.setCharacteristic(Characteristic.StatusActive, that.activeStat);
		}
	});

	this.service
		.getCharacteristic(Characteristic.CurrentTemperature)
		.on("get", this.getState.bind(this));

	this.service
		.getCharacteristic(Characteristic.CurrentTemperature)
		.setProps({
			minValue: -50
		});

	this.service
		.getCharacteristic(Characteristic.CurrentTemperature)
		.setProps({
			maxValue: 125
		});

	if (this.activityTopic !== "") {
		this.service
			.getCharacteristic(Characteristic.StatusActive)
			.on("get", this.getStatusActive.bind(this));
	}
}

TemperatureLogTasmotaAccessory.prototype.getState = function(callback) {
	callback(null, this.temperature);
}

TemperatureLogTasmotaAccessory.prototype.getStatusActive = function(callback) {
	callback(null, this.activeStat);
}

TemperatureLogTasmotaAccessory.prototype.getServices = function() {

	var informationService = new Service.AccessoryInformation();

	informationService
		.setCharacteristic(Characteristic.Name, this.name)
		.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
		.setCharacteristic(Characteristic.Model, this.model)
		.setCharacteristic(Characteristic.SerialNumber, this.serialNumberMAC);

	return [informationService, this.service];
}
