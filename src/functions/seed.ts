import { resolve } from "../../deps.ts";
import { ConnectDb, DisconnectDb } from "./Db.ts";
import { introspect } from "./introspect.ts";
import modelParser from "./modelParser.ts";

export default async function seed(path = "./seed.ts") {
  path = resolve(path);

  await Deno.run({
    cmd: ["deno", "fmt", path],
  }).status();

  const db = await ConnectDb();
  const [dbTables] = await introspect();
  const models: any = await modelParser();

  const modelNameSet: Set<string> = new Set(Object.keys(models)); // set of all table names in the model schema
  const dbTableNameSet: Set<string> = new Set(Object.keys(dbTables)); // set of all table names in the db schema

  // turns seed.ts into an object where each property is a table name set to info about that table's columns
  const seedTables = parseSeed(path);

  // determines whether a given table already exists in the user's db or needs to be created
  const getOperation = (
    seedTableName: string,
    modelNameSet: Set<string>,
    dbTableNameSet: Set<string>,
  ) => {
    if (
      modelNameSet.has(seedTableName) && !(dbTableNameSet.has(seedTableName))
    ) {
      return "Create + Insert";
    } else if (
      modelNameSet.has(seedTableName) && dbTableNameSet.has(seedTableName)
    ) {
      return "Insert";
    }
  };

  for (const seedTableName in seedTables) {
    const operation = getOperation(seedTableName, modelNameSet, dbTableNameSet);

    switch (operation) {
      case "Create + Insert": {
        let modelColumns = models[seedTableName];

        // get the query string for creating that table in the user's db
        const createTableQuery = getCreateTableQuery(
          seedTableName,
          modelColumns,
        );

        // send that query string to the db
        await db.queryObject(createTableQuery);

        // insert values into the newly created table and send query to db
        const insertQuery = getInsertQuery(
          seedTables[seedTableName],
          seedTableName,
        );

        await db.queryObject(insertQuery);
        break;
      }
      case "Insert": {
        // if table already exists in user's db, just insert new values into the table
        const insertQuery = getInsertQuery(
          seedTables[seedTableName],
          seedTableName,
        );

        await db.queryObject(insertQuery);
        break;
      }
      default: {
        console.log(`Invalid Operation On The ${seedTableName} Table`);
        break;
      }
    }
  }

  DisconnectDb(db);
}

// EXPECTS seed.ts file to be a set of variable declarations where each variable has the name of a table
// which is assigned an array of objects, where each object represents a row (with column names as properties
// and the value at that column in that row as the associated value); RETURNS an object where each property
// is a table name set to an array of objects representing each row
const parseSeed = (path = "./seed.ts") => {
  path = resolve(path);

  const output: any = {};

  let data: any = Deno.readTextFileSync(path);

  const whitespaces = /\s/g;

  data = data.replace(whitespaces, "");
  data = data.replace(/(const|let|var)/g, "\n");

  const tables: any = data.match(/\n.*/g)?.map((table: any) =>
    table.slice(1, -1)
  );

  for (const table of tables) {
    const tableName = table.replace(/(\w+).*/, "$1");
    let tableData = table.replace(/.*\=(\[.*\]\.*)/, "$1");

    // make JSON parsable (get rid of trailing commas and put double quotes around property names)
    tableData = tableData.replace(/\,\}/g, "}"); 
    tableData = tableData.replace(/\,\]/g, "]");
    tableData = tableData.replace(
      /([\w\_]+)\:/g,
      '"$1":',
    );

    tableData = JSON.parse(tableData);
    output[tableName] = tableData;
  }

  return output;
};

// returns a query string for creating a table in the user's db and establishing any necessary constraints
const getCreateTableQuery = (tableName: string, columns: any) => {
  let createTableQuery = `CREATE TABLE IF NOT EXISTS ${tableName} (`;

  let constraints = "";

  const associations = [];

  const checks: any = [];

  for (const column in columns) {
    if (columns[column].autoIncrement) columns[column].type = "SERIAL";

    createTableQuery += `${column} ${columns[column].type}`;
    for (const constraint in columns[column]) {
      switch (constraint) {
        case "association": {
          associations.push({
            columnName: column,
            mappedTable: columns[column].association?.mappedTable,
            mappedColumn: columns[column].association?.mappedColumn,
          });
          break;
        }
        case "checks": {
          checks.push(columns[column].checks);
        }
        case "primaryKey": {
          if (columns[column].primaryKey === true) {
            constraints += " PRIMARY KEY";
          }
          break;
        }
        case "notNull": {
          if (columns[column].notNull === true) {
            constraints += " NOT NULL";
          }
          break;
        }
        case "unique": {
          constraints += " UNIQUE";
          break;
        }
        case "defaultVal": {
          constraints += ` DEFAULT ${columns[column].defaultVal}`;
          break;
        }
        default: {
          break;
        }
      }
    }
    createTableQuery += `${constraints}, `;
    constraints = "";
  }

  createTableQuery = createTableQuery.slice(0, createTableQuery.length - 2) +
    "); ";

  let associationsQuery = ``;
  let associationIndex = 0;

  for (const association of associations) {
    const { columnName, mappedTable, mappedColumn } = association;

    associationsQuery += `
      ALTER TABLE ${tableName} ADD CONSTRAINT ${tableName}_${columnName}_fkey${associationIndex++} FOREIGN KEY ("${columnName}") REFERENCES ${mappedTable}(${mappedColumn});
    `;
  }

  let checksQuery = ``;

  for (const check of checks) {
    for (const constraintName in check) {
      let checkQuery =
        `ALTER TABLE ${tableName} ADD CONSTRAINT "${constraintName}" CHECK (`;
      for (const definition of check[constraintName]) {
        const arrayRegex = /\[.*\]/;
        if (arrayRegex.test(definition)) {
          const newDefinition = definition.replace("=", " in ").replace(
            "[",
            "(",
          )
            .replace("]", ")");

          checkQuery += `${newDefinition} AND `;
        } else {
          checkQuery += `${definition} AND `;
        }
      }
      checkQuery = checkQuery.slice(0, -5) + "); ";

      checksQuery += checkQuery;
    }
  }

  createTableQuery += associationsQuery + checksQuery;

  return createTableQuery;
};

// returns a query string for inserting a set of values into their corresponding columns in a table in the user's db
const getInsertQuery = (data: any, tableName: string) => {
  let columns = "";

  for (const column in data[0]) {
    columns += `${column}, `;
  }

  columns = columns.slice(0, columns.length - 2);

  let insertQuery = `INSERT INTO ${tableName} (${columns}) VALUES `;

  let value;
  let values = "";

  for (const datum of data) {
    value = "(";
    for (const key in datum) {
      value += `'${datum[key]}', `;
    }
    value = value.slice(0, value.length - 2) + "), ";
    values += value;
  }

  values = values.slice(0, values.length - 2) + ";";

  insertQuery += values;

  return insertQuery;
};
