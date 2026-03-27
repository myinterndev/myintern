// Mock chalk for Jest tests
const identity = (str: string) => str;

const chalk = {
  green: identity,
  red: identity,
  yellow: identity,
  blue: identity,
  gray: identity,
  bold: identity,
  dim: identity,
  cyan: identity,
  magenta: identity,
  white: identity,
  black: identity,
  bgRed: identity,
  bgGreen: identity,
  bgYellow: identity,
  bgBlue: identity,
  bgMagenta: identity,
  bgCyan: identity,
  bgWhite: identity,
  bgBlack: identity,
};

export default chalk;
