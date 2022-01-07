const express = require('express');
const bodyParser = require('body-parser');
const DataBase = require("node-localstorage").LocalStorage;

const Server = {
    Engine: express(),
    Port: parseInt(process.env.PORT, 10) || 3000
};

let API = {
    Version: 1,
    DataBase: undefined,
    Url: undefined,
    Scopes: {
        Sensors: {
            Values: {},
            Columns: ['ID', 'Designation', 'SerialNumber', 'Manufacturer', 'ManufacturerNumber', 'LocationID'],
            PrimaryKey: 'ID'
        },
        Locations: {
            Values: {},
            Columns: ['ID', 'Designation', 'Coordinates'],
            PrimaryKey: 'ID'
        },
        PhysicalQuantities: {
            Values: {},
            Columns: ['Name', 'Unit', 'FormulaSymbol'],
            PrimaryKey: 'Name'
        },
        Measurements: {
            Values: {},
            Columns: ['SensorID', 'Date', 'Unit', 'Value']
        }
    },

    init: () => {
        API.Url = `/api/v${API.Version}/`;
        API.DataBase = new DataBase(`./api/v${API.Version}`);

        const scopes = Object.entries(API.Scopes);
        for (const [_, scope] of scopes)
            API.loadData(scope);
    },
    loadData: scope => {
        const tableName = API.getName(scope);
        const database = API.DataBase;

        let scopeData = JSON.parse(database.getItem(tableName));
        if (scopeData) scope.Values = scopeData.Values;
    },
    setData: scope => {
        const tableName = API.getName(scope);
        const database = API.DataBase;

        let scopeData = JSON.stringify(scope);
        database.setItem(tableName, scopeData);
    },
    getScopeIndex: scope => {
        const scopes = Object.entries(API.Scopes);
        let index = -1;

        for (let i = 0; i < scopes.length; i++) {
            const [_, obj] = scopes[i];
            if (obj == scope) index = i;
        }

        return index;
    },
    getName: scope => {
        const scopes = Object.entries(API.Scopes);
        const index = API.getScopeIndex(scope);

        let scopeEntry = scopes[index];
        let name = scopeEntry[0];

        return name;
    },
    addItems: (scope, ...valuesList) => {
        let success = [];

        valuesList.forEach(values => {
            let item = {}
            let primaryKey;

            scope.Columns.forEach(column => {
                if (scope.PrimaryKey == column) primaryKey = values[column]
                else if (values[column] != undefined) item[column] = values[column];
            });

            if ((scope.PrimaryKey && primaryKey == undefined) || !Object.keys(item).length) success.push(false);
            else {
                let key = scope.PrimaryKey ? primaryKey : Object.keys(scope.Values).length;
                scope.Values[key] = item;

                success.push(true);
            }

            logProgress(success.length, valuesList.length);
        })
        
        process.stdout.write('\n');

        API.setData(scope);
        
        return success;
    },
    addItem: (scope, values) => {
        let item = {}
        let primaryKey;

        for (const column of scope.Columns) {
            if (scope.PrimaryKey == column) primaryKey = values[column]
            else if (values[column] != undefined) item[column] = values[column];
        }

        if ((scope.PrimaryKey && primaryKey == undefined) || !Object.keys(item).length) return false;

        let key = scope.PrimaryKey ? primaryKey : Object.keys(scope.Values).length;
        scope.Values[key] = item;

        API.setData(scope);

        return true;
    },
    editItem: (scope, key, values) => {
        let item = API.getItem(scope, key);
        if (!item) return false;

        for (const column of scope.Columns) {
            if (values[column] != undefined) item[column] = values[column];
        }

        scope.Values[key] = item;
        API.setData(scope);

        return true;
    },
    removeItems: scope => {
        scope.Values = {};
        API.setData(scope);
    },
    removeItem: (scope, key) => {
        let item = API.getItem(scope, key);
        if (!item) return false;

        delete scope.Values[key];
        API.setData(scope);

        return true;
    },
    getItems: scope => scope.Values,
    getItem: (scope, key) => scope.Values[key]
};

API.init();

//#region REST-API generator
// https://www.a-coding-project.de/ratgeber/apis/rest

Server.Engine.set('case sensitive routing', false);
Server.Engine.use(bodyParser.urlencoded({ extended: false }))
Server.Engine.use(bodyParser.json())

// return list of all scopes of database
Server.Engine.get(new RegExp(`${API.Url}:scopes$`), (_, res) => {
    let data = Object.keys(API.Scopes);
    return res.send(JSON.stringify(data));
});

const scopes = Object.entries(API.Scopes);
for (const [name, scope] of scopes) {
    const urlRoot = API.Url + name.replace(' ', '+');
    const urlPart = '[^/]*/?';
    const optionalSlash = '[/]?'

    // return full list of items
    Server.Engine.get(new RegExp(`${urlRoot}${optionalSlash}$`), (req, res) => {
        let data = API.getItems(scope)

        if (scope.Values && Object.keys(req.query).length > 0) {
            const entries = Object.entries(scope.Values);

            // TODO: Add more filters
            const from = req.query.from ?? 0;
            const count = req.query.count ?? Infinity;
            
            let filteredEntries = []

            filteredEntries = entries.splice(from, count);

            data = filteredEntries.reduce((a, v) => ({ ...a, [v[0]]: v[1] }), {});
        }

        return res.send(JSON.stringify(data));
    });

    // add a new item
    Server.Engine.post(new RegExp(`${urlRoot}${optionalSlash}?$`), (req, res) => {
        var data = req.body || req.query;
        return res.sendStatus(API.addItem(scope, data) ? 204 : 422);
    });

    // return a specific item with a key
    Server.Engine.get(new RegExp(`${urlRoot}/${urlPart}$`), (req, res) => {
        let key = escapeKey(req.path, urlRoot);

        if (key == ':structure') {
            const { Values, ...Structure } = scope;
            return res.send(Structure);
        }

        return res.send(JSON.stringify(API.getItem(scope, key)) ?? 404);
    });

    // edit a specific item with a key
    Server.Engine.patch(new RegExp(`${urlRoot}/${urlPart}$`), (req, res) => {
        let key = escapeKey(req.path, urlRoot);
        var data = req.body || req.query;
        return res.sendStatus(API.editItem(scope, key, data) ? 204 : 404);
    });

    // delete a specific item with a key
    Server.Engine.delete(new RegExp(`${urlRoot}/${urlPart}$`), (req, res) => {
        let key = escapeKey(req.path, urlRoot);
        return res.sendStatus(API.removeItem(scope, key) ? 204 : 404);
    });

    // return a value of a specific column from a specific item
    Server.Engine.get(new RegExp(`${urlRoot}/${urlPart}/${urlPart}$`), (req, res) => {
        let col = escapeKey(req.path, new RegExp(`${urlRoot}/${urlPart}`));
        let key = escapeKey(req.path, urlRoot).replace(col, '');
        return res.send(JSON.stringify(API.getItem(scope, key)[col]) ?? 404);
    });
}

function escapeKey(url, urlRoot) {
    return url.replace(urlRoot, '').replaceAll('/', '').replaceAll('+', ' ');
}

//#endregion

Server.Engine.use(express.static('public'));
Server.Engine.listen(Server.Port);

console.log(`Server is running at http://localhost:${Server.Port}/`)

//#region RandomGenerator
//* [Start] RandomGenerator   >------------------------------------------------------------------------------------------------------------------------------------------

function generateData() {
    const infoSpace = ' '.repeat(4);
    const progressSpace = infoSpace + ' '.repeat(2);

    function genPhysicalQuantities() {
        // ['Name', 'Unit', 'FormulaSymbol']
        console.log(infoSpace +  '⌞ add list of base physical quantities ...');
        process.stdout.write(progressSpace);

        API.addItems(API.Scopes.PhysicalQuantities,
            { Name: 'Length', Unit: 'metre', FormulaSymbol: 'm' },
            { Name: 'Mass', Unit: 'kilogram', FormulaSymbol: 'kg' },
            { Name: 'Time', Unit: 'second', FormulaSymbol: 's' },
            { Name: 'ElectricCurrent', Unit: 'ampere', FormulaSymbol: 'A' },
            { Name: 'Temperature', Unit: 'kelvin', FormulaSymbol: 'K' },
            { Name: 'Amount Of Substance', Unit: 'mole', FormulaSymbol: 'mol' },
            { Name: 'Luminosity', Unit: 'candela', FormulaSymbol: 'cd' });
    }

    function genLocations() {
        // ['ID', 'Designation', 'Coordinates']
        console.log(infoSpace + '⌞ add list of locations ...');
        process.stdout.write(progressSpace);

        API.addItems(API.Scopes.Locations,
            { ID: 0, Designation: 'Studenzen', Coordinates: [47.0104, 15.7945] },
            { ID: 1, Designation: 'Fladnitz', Coordinates: [47.9917, 15.7853] },
            { ID: 2, Designation: 'Haiku Stairs', Coordinates: [36.1146, -115.1728] },
            { ID: 3, Designation: 'Crooked Forest', Coordinates: [53.1969, 14.4930] },
            { ID: 4, Designation: 'The Door to Hell', Coordinates: [40.1833, 58.4] });
    }

    function genSensors(sensorCount, maxMeasureCount, manufacturers, sensorTypes) {
        // ['ID', 'Designation', 'SerialNumber', 'Manufacturer', 'ManufacturerNumber ', 'LocationID']
        let sensors = [];
        let measures = [];

        console.log(infoSpace + '⌞ generate random sensors and measures ...');
        process.stdout.write(progressSpace);

        let oldManufacturerNumber = randomNumber(4);
        for (let sensorId = 0; sensorId < sensorCount; sensorId++) {
            const designation = sensorTypes[randomNumber(1, sensorTypes.length)];
            const serialNumber = randomNumber(8);

            const manufacturer = manufacturers[randomNumber(1, manufacturers.length)];
            const manufacturerNumber = randomNumber(1, 2) == 0 ? oldManufacturerNumber : randomNumber(4);

            const locationCount = Object.keys(API.Scopes.Locations.Values).length;
            const locationID = randomNumber(locationCount);

            oldManufacturerNumber = manufacturerNumber;

            logProgress(sensorId + 1, sensorCount);

            sensors[sensorId] = {
                ID: sensorId,
                Designation: designation,
                SerialNumber: serialNumber,
                Manufacturer: manufacturer,
                ManufacturerNumber: manufacturerNumber,
                LocationID: locationID
            };

            const measureCount = randomNumber(1, maxMeasureCount);
            measures[sensorId] = genMeasurements(sensorId, measureCount)
        }

        process.stdout.write('\n');
        
        console.log(infoSpace + '⌞ add list of sensors ...');
        process.stdout.write(progressSpace);
        API.addItems(API.Scopes.Sensors, ...sensors);

        measures = measures.reduce((acc, val) => acc.concat(val), []);
        console.log(infoSpace + `⌞ add list of measures ...`);
        process.stdout.write(progressSpace);
        API.addItems(API.Scopes.Measurements, ...measures);
    }

    function genMeasurements(sensorId, measureCount) {
        // ['Value', 'Date', 'Unit', 'SensorID']
        const units = Object.keys(API.Scopes.PhysicalQuantities.Values);

        let measurements = Array(measureCount).fill({});

        measurements.forEach((_, i, array) => {
            const value = randomNumber(3);
            const date = randomDate(new Date(0, 0, 0), new Date());
            const unit = units[randomNumber(1, units.length)];

            array[i] = {
                Value: value,
                Date: date,
                Unit: unit,
                SensorID: sensorId
            };
        });

        return measurements;
    }

    function randomNumber(length, max) {
        let random = '';
        max = max ?? 10;

        for (let i = 0; i < length; i++)
            random += Math.floor(Math.random() * max);

        return Number(random);
    }

    function randomDate(start, end) {
        return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    }

    let manufacturers = [
        'Manufacture1',
        'Manufacture2',
        'Manufacture3'
    ];

    let sensorTypes = [
        'Sensor1',
        'Sensor2'
    ];

    console.log('\n-= Start generating database =-\n');
    genPhysicalQuantities();
    genLocations();
    genSensors(200, 500, manufacturers, sensorTypes);
    console.log('\n-= Finish generating database =-\n');
}

if (!Object.keys({ ...API.Scopes.Locations.Values, ...API.Scopes.PhysicalQuantities.Values }).length) generateData();

// [End] RandomGenerator      >------------------------------------------------------------------------------------------------------------------------------------------ */
//#endregion

function logProgress(current, target) {
    let percent = Math.round(current / target * 100);
    let progressBar = '█'.repeat(Math.round(percent / 5)) + '-'.repeat(20 - Math.round(percent / 5));
    let status = ` |${progressBar}| ${percent}% Complete (${current}/${target})`;
    process.stdout.write(`${status}`);
    process.stdout.moveCursor(-1 * status.length);

    if (current == target) console.log();
}