// Compile DocumentLedger.sol with the pinned solc and write the ABI and
// bytecode the API ships with. Run after changing the contract:
//   cd blockchain && npm ci && npm run compile
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import solc from 'solc'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(resolve(here, 'contracts/DocumentLedger.sol'), 'utf8')

const input = {
  language: 'Solidity',
  sources: { 'DocumentLedger.sol': { content: source } },
  settings: {
    // Paris avoids opcodes older test EVMs lack; Base runs it unchanged.
    evmVersion: 'paris',
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
}

const output = JSON.parse(solc.compile(JSON.stringify(input)))
const errors = (output.errors ?? []).filter((error) => error.severity === 'error')
if (errors.length) {
  for (const error of errors) console.error(error.formattedMessage)
  process.exit(1)
}

const contract = output.contracts['DocumentLedger.sol'].DocumentLedger
const artifact = {
  contractName: 'DocumentLedger',
  compiler: `solc ${solc.version()}`,
  evmVersion: input.settings.evmVersion,
  abi: contract.abi,
  bytecode: `0x${contract.evm.bytecode.object}`,
}
const target = resolve(here, '../backend/app/ledger_contract.json')
writeFileSync(target, `${JSON.stringify(artifact, null, 2)}\n`)
console.log(`Wrote ${target}`)
