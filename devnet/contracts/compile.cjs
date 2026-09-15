// Compiles the dev-chain contracts into artifacts.json (committed, so running the
// dev chain does not need a Solidity compiler). To recompile:
//   npm install --no-save solc@0.8.26 && node devnet/contracts/compile.cjs
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const dir = __dirname;
const sources = {};
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sol"))) {
  sources[file] = { content: fs.readFileSync(path.join(dir, file), "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors || []).filter((e) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}

const artifacts = {};
for (const file of Object.keys(output.contracts)) {
  for (const [name, c] of Object.entries(output.contracts[file])) {
    artifacts[name] = {
      abi: c.abi,
      bytecode: "0x" + c.evm.bytecode.object,
      deployedBytecode: "0x" + c.evm.deployedBytecode.object,
    };
  }
}

fs.writeFileSync(path.join(dir, "artifacts.json"), JSON.stringify(artifacts, null, 2) + "\n");
console.log(`compiled ${Object.keys(artifacts).length} contracts with solc ${solc.version()}`);
