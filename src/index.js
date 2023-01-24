import { ethers  } from 'ethers'
import dotenv from 'dotenv'
import fs from 'fs'
import sleep from 'atomic-sleep'
import { BscscanProvider } from "@ethers-ancillary/bsc";

dotenv.config()

const mainPresaleWallet = '0x27315f5f282c31fbade4ae952d2631c05cd3a26f'
const presaleWallet2 = '0xfda67053c283f45f00071b4f0f69d63f29e7583e'
const presaleWallet3 = '0x5a775c39cb1b9cab1a108b4126c870369a064f9b'
const presaleWallets = [mainPresaleWallet, presaleWallet2, presaleWallet3]

const usdtContractAddress = '0xdAC17F958D2ee523a2206206994597C13D831ec7'

const etherscan = new ethers.providers.EtherscanProvider(null, process.env.ETHERSCAN_API_KEY)
const infura = new ethers.providers.InfuraProvider(null, process.env.INFURA_API_KEY)
const bscscan = new BscscanProvider(null, process.env.BSCSCAN_API_KEY)

const erc20ABI = JSON.parse(fs.readFileSync('abis/erc20.json', 'utf8'))
const usdt = new ethers.Contract(usdtContractAddress, erc20ABI, infura)
const usdtIface = new ethers.utils.Interface(erc20ABI)

const startBlockEth = 15226103
const startBlockBnb = 18811500

const currentEthBlock = async () => await infura.getBlockNumber()

const currentBnbBlock = async () => await bscscan.getBlockNumber()

const skip = (to) => !presaleWallets.includes(to)

const uniqueWallets = {}

const getUsdtTransactions = async (start, end, walletAddress) => {
  let current = end
  const eventFilter = usdt.filters.Transfer(null, walletAddress)
  while (true) {
    let events = await usdt.queryFilter(eventFilter, start, current)
    if (events.length >= 10000) {
      current = start + Math.ceil((current-start)/2)
      continue
    }
    for await (const event of events) {
      const log = usdtIface.parseLog(event)
      const to = log.args.to.toLowerCase()
      // Only care about transactions that are sent to our presale wallets
      if (skip(to)) {
        continue
      }
      const fromWalletAddress = log.args.from.toLowerCase()
      uniqueWallets[fromWalletAddress] = true
    }
    start = current
    if (current === end) {
      break
    }
    current = end
  }
}

const getEthTransactions = async (start, end, walletAddress) => {
  let current = end
  while (true) {
    const history = await etherscan.getHistory(walletAddress, start, current)
    if (history.length >= 10000) {
      current = start + Math.ceil((current-start)/2)
      continue
    }
    for await (const transaction of history) {
      const to = transaction.to.toLowerCase()
      if (skip(to)) {
        continue
      }
      const fromWalletAddress = transaction.from.toLowerCase()
      uniqueWallets[fromWalletAddress] = true
    }
    start = current
    if (current === end) {
      break
    }
    current = end
    // Rate limit of 5 a second
    sleep(0.2)
  }
}

const getBnbTransactions = async (start, end, walletAddress) => {
  let current = end
  while (true) {
    const history = await bscscan.getHistory(walletAddress, start, current)
    if (history.length >= 10000) {
      current = start + Math.ceil((current-start)/2)
      continue
    }
    for await (const transaction of history) {
      const to = transaction.to.toLowerCase()
      if (skip(to)) {
        continue
      }
      const walletAddress = transaction.from.toLowerCase()
      uniqueWallets[walletAddress] = true
    }
    start = current
    if (current === end) {
      break
    }
    current = end
    // Rate limit of 5 a second
    sleep(0.2)
  }
}

for await (const presaleWallet of presaleWallets) {
  await getUsdtTransactions(startBlockEth, await currentEthBlock(), presaleWallet)
  await getEthTransactions(startBlockEth, await currentEthBlock(), presaleWallet)
  await getBnbTransactions(startBlockBnb, await currentBnbBlock(), presaleWallet)
}

console.log('Unique wallets ', Object.keys(uniqueWallets).length)
