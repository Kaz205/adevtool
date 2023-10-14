import util from 'util'
import { exec as execCb } from 'child_process'

const exec = util.promisify(execCb)

export async function run(command: string) {
  // TODO: stop using shell
  let { stdout } = await exec(command)
  return stdout.trim()
}

export async function aapt2(path: string, ...args: Array<string>) {
  return await run(`${path} ${args.join(' ')}`)
}

export async function avbtool(path: string, ...args: Array<string>) {
  return await run(`${path} ${args.join(' ')}`)
}
