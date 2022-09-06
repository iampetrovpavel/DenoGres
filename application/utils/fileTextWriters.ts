export const writeQueryText = (uri: string, userQueryStr: string): string => {
  const fullQueryString: string = userQueryStr.slice(0, -2) + '\'' + uri + '\'' + userQueryStr.slice(-2);
  return `
    import * as denogres from '../user/model.ts';\n
    const logResults = async (): Promise<void> => {
      const result = await denogres.${fullQueryString}
      const stringified = JSON.stringify(
        result, 
        (key, value) => typeof value === "bigint" ? value.toString() : value
      );
      console.log(stringified);
    };
    logResults();
  `;
};