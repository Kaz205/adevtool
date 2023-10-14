import { Command, flags } from '@oclif/command'

import { createVendorDirs } from '../blobs/build'
import { copyBlobs } from '../blobs/copy'
import { BlobEntry } from '../blobs/entry'
import { DeviceConfig, loadDeviceConfigs } from '../config/device'
import { forEachDevice } from '../frontend/devices'
import { enumerateFiles, extractProps, generateBuildFiles, PropResults } from '../frontend/generate'
import { WRAPPED_SOURCE_FLAGS, wrapSystemSrc } from '../frontend/source'
import { withSpinner } from '../util/cli'
import { withTempDir } from '../util/fs'

const doDevice = (
  config: DeviceConfig,
  stockSrc: string,
  avbtoolPath: string,
  buildId: string | undefined,
  skipCopy: boolean,
  useTemp: boolean,
) =>
  withTempDir(async tmp => {
    // Prepare stock system source
    let wrapBuildId = buildId == undefined ? null : buildId
    let factoryPath = `${stockSrc}/${config.device.name}-${wrapBuildId}`
    let wrapped = await withSpinner('Extracting stock system source', spinner =>
      wrapSystemSrc(stockSrc, config.device.name, wrapBuildId, useTemp, tmp, spinner),
    )
    stockSrc = wrapped.src!

    // Each step will modify this. Key = combined part path
    let namedEntries = new Map<string, BlobEntry>()

    // Prepare output directories
    let dirs = await createVendorDirs(config.device.vendor, config.device.name)

    // 1. Diff files
    await withSpinner('Enumerating files', spinner =>
      enumerateFiles(spinner, config.filters.dep_files, null, namedEntries, null, stockSrc),
    )

    // After this point, we only need entry objects
    let entries = Array.from(namedEntries.values())

    // 2. Extract
    // Copy blobs (this has its own spinner)
    if (config.generate.files && !skipCopy) {
      await copyBlobs(entries, stockSrc, dirs.proprietary)
    }

    // 3. Props
    let propResults: PropResults | null = null
    if (config.generate.props) {
      propResults = await withSpinner('Extracting properties', () => extractProps(config, null, stockSrc))
      delete propResults.missingProps
      delete propResults.fingerprint
    }

    // 4. Build files
    await withSpinner('Generating build files', () =>
      generateBuildFiles(config, dirs, entries, [], propResults, null, null, null, stockSrc, avbtoolPath, factoryPath, false, true),
    )
  })

export default class GeneratePrep extends Command {
  static description = 'generate vendor parts to prepare for reference AOSP build (e.g. for collect-state)'

  static flags = {
    help: flags.help({ char: 'h' }),
    avbtool: flags.string({
      char: 'v',
      description: 'path to avbtool executable',
      default: 'out/host/linux-x86/bin/avbtool',
    }),
    skipCopy: flags.boolean({
      char: 'k',
      description: 'skip file copying and only generate build files',
      default: false,
    }),
    parallel: flags.boolean({
      char: 'p',
      description: 'generate devices in parallel (causes buggy progress spinners)',
      default: false,
    }),

    ...WRAPPED_SOURCE_FLAGS,
  }

  static args = [{ name: 'config', description: 'path to device-specific YAML config', required: true }]

  async run() {
    let {
      flags: { avbtool: avbtoolPath, buildId, stockSrc, skipCopy, useTemp, parallel },
      args: { config: configPath },
    } = this.parse(GeneratePrep)

    let devices = await loadDeviceConfigs(configPath)

    await forEachDevice(
      devices,
      parallel,
      async config => {
        await doDevice(config, stockSrc, avbtoolPath, buildId, skipCopy, useTemp)
      },
      config => config.device.name,
    )
  }
}
