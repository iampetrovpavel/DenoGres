import { sqlDataTypes } from "../constants/sqlDataTypes.ts";
import { createClassName } from "../functions/StringFormat.ts";
import { introspect } from "./introspect.ts";
import { checkDbPull } from "./checkDbPull.ts";
import { resolve } from "../../deps.ts";

export let wasFired: boolean;

// * reads PSQL database information, convert them into JS objects, then write them into the model.ts file
export async function dbPull() {
  const [tableListObj, enumObj] = await introspect();

  let autoCreatedModels =
    `import { Model } from 'https://deno.land/x/denogres/mod.ts'\n// user model definition comes here\n\n`;

  // iterate over the properties of tableListObj
  Object.keys(tableListObj).forEach((el) => {
    // reference to table object
    const tableObj = tableListObj[el];
    // create the class name
    const className = createClassName(el);
    // initialize interface code holder
    let interfaceCode = `\nexport interface ${className} {\n`;
    // initialize class code holder
    let classCode = `export class ${className} extends Model {\n` +
      `  static table = '${el}';\n` +
      `  static columns = {\n`;

    // iterate over each property within the columns object
    Object.keys(tableListObj[el]).forEach((colName) => {
      const columnObj = tableListObj[el][colName];
      // console.log(columnObj);

      // add the column as a property to the interface, checking for enums first
      if (columnObj.type.includes("enum")) {
        const enumName = columnObj.enumName;

        const enumCapitalized = enumName[0].toUpperCase() + enumName.slice(1);
        interfaceCode += `  ${colName}: keyof typeof ${enumCapitalized}\n`;
      } else {
        interfaceCode += `  ${colName}: ${sqlDataTypes[columnObj.type]}\n`;
      }

      // * if a given column is typed as ENUM
      if (columnObj.type.includes("enum")) {
        classCode += `    ${colName}: {\n` +
          `      type: 'enum',\n`;
        classCode += `      enumName: '${columnObj.enumName}',\n`;
      } else {
        classCode += `    ${colName}: {\n` +
          `      type: '${columnObj.type}',\n`;
      }

      if (columnObj.notNull) classCode += `      notNull: true,\n`;
      else if (!columnObj.type.includes("enum")) {
        classCode += `      notNull: false,\n`;
      }
      // for each 'property' of the column add it to the object
      // ! upcoming feature
      if (columnObj.length) classCode += `      length: ${columnObj.length},\n`;

      if (columnObj.autoIncrement) classCode += `      autoIncrement: true,\n`;

      if (columnObj.defaultVal) {
        classCode += `      defaultVal: ${columnObj.defaultVal},\n`;
      }

      if (columnObj.primaryKey) classCode += `      primaryKey: true,\n`;

      if (columnObj.unique) classCode += `      unique: true,\n`;

      if (columnObj.checks) {
        classCode += `      checks: ${JSON.stringify(columnObj.checks)},\n`;
      }

      if (columnObj.association) {
        classCode += `      association: {\n` +
          `        name: '${columnObj.association.name}',\n` +
          `        mappedTable: '${columnObj.association.mappedTable}',\n` +
          `        mappedColumn: '${columnObj.association.mappedColumn}',\n      }\n`;
      }

      // close the column obj
      classCode += `    },\n`;
    });

    // close the interface and class code
    interfaceCode += `}\n\n`;
    classCode += `  }\n`;
    // add the interface and class code to the autoCreatedModels string
    autoCreatedModels += interfaceCode + classCode;
    // close the query for this table
    autoCreatedModels += `}\n\n`;
  });
  // Add all enums from enum object
  Object.keys(enumObj).forEach((el) => {
    const enumCapitalized = el[0].toUpperCase() + el.substring(1);
    autoCreatedModels += `export enum ${enumCapitalized} {\n`;
    enumObj[el].forEach((str) => {
      autoCreatedModels += `${str},\n`;
    });
    autoCreatedModels += `}\n\n`;
  });
  // Create the model.ts file
  Deno.writeTextFileSync("./models/model.ts", autoCreatedModels);

  // * format the newly created model.ts file
  await Deno.run({
    cmd: ["deno", "fmt", resolve("./models/model.ts")],
  }).status();
  checkDbPull(); //* Added this in for migration log
}
