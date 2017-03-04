// Sonoff-Tasmota Temperature Sensor Accessory plugin for HomeBridge with log and min-max temp by @MacWyznawca Jaromir Kopp

var Service, Characteristic;
var mqtt = require("mqtt");

var schedule = require('node-schedule');

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
	this.savePeriod = this.savePeriod < 10 ? 10 : this.savePeriod; // min. period 10 minutes

	//	this.savePeriod = 1; // FOR TEST ONLY!!!

	this.sensorPropertyName = config["sensorPropertyName"] || "Sensor";

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
	
	this.maxTmp = [Date(1968, 4, 29), -49.9];
	this.minTmp = [Date(1968, 4, 29), 124.9];

	this.client = mqtt.connect(this.url, this.options);

	this.client.on("error", function() {
		that.log("Error event on MQTT");
	});

	this.client.on("connect", function() {
		if (config["startCmd"] !== undefined) {
			that.client.publish(config["startCmd"], config["startParameter"] !== undefined ? config["startParameter"] : "");
		}
	});

	this.client.subscribe(this.topic);

	this.service = new Service.TemperatureSensor(this.name);

	if (this.activityTopic !== "") {
		this.client.subscribe(this.activityTopic);

		this.service.addOptionalCharacteristic(Characteristic.StatusActive);

		this.service
			.getCharacteristic(Characteristic.StatusActive)
			.on("get", this.getStatusActive.bind(this));
	}

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

	var that = this;

	this.client.on("message", function(topic, message) {
		if (topic == that.topic) {
			that.temperature = -49.9;
			data = JSON.parse(message);
			if (data === null) {
				that.temperature = parseFloat(message);
			} else if (data.hasOwnProperty("DS18B20")) {
				that.temperature = parseFloat(data.DS18B20.Temperature);
			} else if (data.hasOwnProperty("DS18x20")) {
				that.temperature = parseFloat(data.DS18x20.Temperature);
			} else if (data.hasOwnProperty("DHT")) {
				that.temperature = parseFloat(data.DHT.Temperature);
			} else if (data.hasOwnProperty("DHT22")) {
				that.temperature = parseFloat(data.DHT22.Temperature);
			} else if (data.hasOwnProperty("AM2301")) {
				that.temperature = parseFloat(data.AM2301.Temperature);
			} else if (data.hasOwnProperty("DHT11")) {
				that.temperature = parseFloat(data.DHT11.Temperature);
			} else if (data.hasOwnProperty("HTU21")) {
				that.temperature = parseFloat(data.HTU21.Temperature);
			} else if (data.hasOwnProperty("BMP280")) {
				that.temperature = parseFloat(data.BMP280.Temperature);
			} else if (data.hasOwnProperty("BME280")) {
				that.temperature = parseFloat(data.BME280.Temperature);
			} else if (data.hasOwnProperty("BMP180")) {
				that.temperature = parseFloat(data.BMP180.Temperature);
			} else if (data.hasOwnProperty(that.sensorPropertyName)) {
				that.temperature = parseFloat(data[that.sensorPropertyName].Temperature);
			} else {
				return null
			}
			that.service.setCharacteristic(Characteristic.CurrentTemperature, that.temperature);

			// Write temperature to file	
			if (that.patchToSave) {
				var zeroDate = that.zeroHour ? (new Date()).setHours(that.zeroHour, 0, 0, 0) : false;
				// min temp
				that.fs.readFile(that.patchToSave + that.filename + "_minTemp.txt", "utf8", function(err, data) {
					if (err) {
						that.minTmp = [new Date().toISOString(), that.temperature];
						that.fs.writeFile(that.patchToSave + that.filename + "_minTemp.txt", that.minTmp.join("\t"), "utf8", function(err) {
							if (err) {
								that.patchToSave = false;
								that.log("Problem with save minTemp file");
							}
						});
					} else {
						that.minTmp = data.split("\t");
						that.log("that.minTmp po odczycie", that.minTmp);
						if (that.minTmp.lenght < 2 || !((new Date(that.minTmp[0])).getTime() > 0)) {
							that.minTmp = [new Date().toISOString(), that.temperature];
							that.fs.writeFile(that.patchToSave + that.filename + "_minTemp.txt", that.minTmp.join("\t"), "utf8", function(err) {
								if (err) {
									that.patchToSave = false;
									that.log("Problem with save minTemp file");
								}
							});
						}
						// how old is last record?
						if (zeroDate ? (new Date(that.minTmp[0])).getTime() - zeroDate < -86400000 : (new Date).getTime() - (new Date(that.minTmp[0])).getTime() > 86400000) {
							that.minTmp = [(new Date()).toISOString(), that.temperature];
							that.fs.writeFile(that.patchToSave + that.filename + "_minTemp.txt", that.minTmp.join("\t"), "utf8", function(err) {
								if (err) throw err;
							});
						} else {
							if (that.temperature < parseFloat(that.minTmp[1])) {
								that.minTmp = [(new Date()).toISOString(), that.temperature];
								that.fs.writeFile(that.patchToSave + that.filename + "_minTemp.txt", that.minTmp.join("\t"), "utf8", function(err) {
									if (err) throw err;
								});
							}
						}
					}
				});
				// max temp	
												
				that.fs.readFile(that.patchToSave + that.filename + "_maxTemp.txt", 'utf8', function(err, data) {
					if (err) {
						that.maxTmp = [(new Date()).toISOString(), that.temperature];
						that.fs.writeFile(that.patchToSave + that.filename + "_maxTemp.txt", that.maxTmp.join("\t"), "utf8", function(err) {
							if (err) {
								that.patchToSave = false;
								that.log("Problem with save maxTemp file");
							}
						});
					} else {
						that.maxTmp = data.split("\t");
						that.log("that.maxTmp po odczycie", that.maxTmp);
						if (that.maxTmp.lenght < 2 || !((new Date(that.maxTmp[0])).getTime() > 0)) {
							that.maxTmp = [(new Date()).toISOString(), that.temperature];
							that.fs.writeFile(that.patchToSave + that.filename + "_maxTemp.txt", that.maxTmp.join("\t"), "utf8", function(err) {
								if (err) {
									that.patchToSave = false;
									that.log("Problem with save mmaxTemp file");
								}
							});
						}
						// how old is last record?	
						if (zeroDate ? (new Date(that.maxTmp[0])).getTime() - zeroDate < -86400000 : (new Date).getTime() - (new Date(that.maxTmp[0])).getTime() > 86400000) {
							that.maxTmp = [(new Date()).toISOString(), that.temperature];
							that.fs.writeFile(that.patchToSave + that.filename + "_maxTemp.txt", that.maxTmp.join("\t"), "utf8", function(err) {
								if (err) throw err;
							});
						} else {
							if (that.temperature > parseFloat(that.maxTmp[1])) {
								that.maxTmp = [(new Date()).toISOString(), that.temperature];
								that.fs.writeFile(that.patchToSave + that.filename + "_maxTemp.txt", that.maxTmp.join("\t"), "utf8", function(err) {
									if (err) throw err;
								});
							}
						}
					}
				});
				if (((new Date).getTime() - that.lastSaveData.getTime()) >= (Math.abs(that.savePeriod) * 60000)) {
					if (that.savePeriod > 0) {
						that.fs.appendFile(that.patchToSave + that.filename + "_temp.txt", convertDateUTCDtoLocalStr(data.Time) + "\t" + that.temperature + "\n", "utf8", function(err) {
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

	// Roll temp. files mothly
	var j = schedule.scheduleJob("0 0 1 * *", function() {
		that.fs.rename(that.patchToSave + that.filename + "_temp.txt", that.patchToSave + that.filename + "_temp_" + convertDateTofilename(data.Time) + ".txt", function(err) {
			if (err) that.log('ERROR change filename: ' + err);
		});
	});
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
