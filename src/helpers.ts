import {
  BigDecimal,
  BigInt,
  Bytes,
  dataSource,
  Address,
  ethereum,
  log
} from '@graphprotocol/graph-ts'

import {
  Pool as PoolEntity,
  User,
  PoolToken,
  PoolShare,
  PoolTransaction,
  PoolFactory,
  Datatoken,
  TokenBalance,
  TokenTransaction,
  PoolTransactionTokenValues
} from './@types/schema'

import { Pool } from './@types/templates/Pool/Pool'

export const ZERO_BD = BigDecimal.fromString('0.0')
export const MINUS_1_BD = BigDecimal.fromString('-1.0')
export const ONE_BD = BigDecimal.fromString('1.0')

export const ONE_BASE_18 = BigInt.fromI32(10).pow(18 as u8)
export const BONE = BigDecimal.fromString('1000000000000000000')

export const ENABLE_DEBUG = true

const network = dataSource.network()

function getOceanAddress(): string {
  // switch is not working for some reason
  if (network == 'ropsten') return '0x5e8dcb2afa23844bcc311b00ad1a0c30025aade9'
  if (network == 'rinkeby') return '0x8967bcf84170c91b0d24d4302c2376283b0b3a07'
  if (network == 'polygon') return '0x282d8efce846a88b159800bd4130ad77443fa1a1'
  if (network == 'moonbeamalpha')
    return '0x3c21a90599b5b7f37014ca5bf30d3f1b73d7e391'

  return '0x967da4048cd07ab37855c090aaf366e4ce1b9f48'
}

export const OCEAN: string = getOceanAddress()

export function _debuglog(
  message: string,
  event: ethereum.Event,
  args: Array<string>
): void {
  if (event != null) {
    args.push(event.transaction.hash.toHex())
    args.push(event.address.toHex())
  }
  for (let i = 0; i < args.length; i++) {
    message = message.concat(' {}')
  }
  log.info('@@@@@@ ' + message, args)
}

export function debuglog(
  message: string,
  event: ethereum.Event,
  args: Array<string>
): void {
  if (!ENABLE_DEBUG) return
  _debuglog(message, event, args)
}

export function hexToDecimal(hexString: string, decimals: i32): BigDecimal {
  const bytes = Bytes.fromHexString(hexString.toString()).reverse() as Bytes
  const bi = BigInt.fromUnsignedBytes(bytes)
  const scale = BigInt.fromI32(10)
    .pow(decimals as u8)
    .toBigDecimal()
  return bi.divDecimal(scale)
}

export function bigIntToDecimal(amount: BigInt, decimals: i32): BigDecimal {
  const scale = BigInt.fromI32(10)
    .pow(decimals as u8)
    .toBigDecimal()
  return amount.toBigDecimal().div(scale)
}

export function tokenToDecimal(amount: BigDecimal, decimals: i32): BigDecimal {
  const scale = BigInt.fromI32(10)
    .pow(decimals as u8)
    .toBigDecimal()
  return amount.div(scale)
}

export function decimalToBigInt(value: BigDecimal): BigInt {
  value.truncate(18)
  const scale = BigInt.fromI32(10).pow((value.exp.toI32() + 18) as u8)
  return value.digits.times(scale)
}

export function updatePoolTokenBalance(
  poolToken: PoolToken,
  balance: BigDecimal,
  source: string
): void {
  debuglog(
    '########## updating poolToken balance (source, oldBalance, newBalance, poolId) ',
    null,
    [source, poolToken.balance.toString(), balance.toString(), poolToken.poolId]
  )
  if (balance < ZERO_BD || poolToken.balance < ZERO_BD) {
    log.warning(
      'EEEEEEEEEEEEEEEEE poolToken.balance < Zero: pool={}, poolToken={}, oldBalance={}, newBalance={}',
      [
        poolToken.poolId,
        poolToken.tokenAddress.toString(),
        poolToken.balance.toString(),
        balance.toString()
      ]
    )
  }

  poolToken.balance = balance
}

export function createUserEntity(address: string): void {
  if (User.load(address) == null) {
    const user = new User(address)
    user.save()
  }
}

export function createPoolShareEntity(
  id: string,
  pool: string,
  user: string
): void {
  const poolShare = new PoolShare(id)

  createUserEntity(user)

  poolShare.userAddress = user
  poolShare.poolId = pool
  poolShare.balance = ZERO_BD
  poolShare.save()
}

export function createPoolTokenEntity(
  id: string,
  pool: string,
  address: string
): void {
  const datatoken = Datatoken.load(address)

  const poolToken = new PoolToken(id)
  poolToken.poolId = pool
  poolToken.tokenId = datatoken ? datatoken.id : ''
  poolToken.tokenAddress = address
  poolToken.balance = ZERO_BD
  poolToken.denormWeight = ZERO_BD
  poolToken.save()
}

export function updatePoolTransactionToken(
  poolTx: string,
  poolTokenId: string,
  amount: BigDecimal,
  balance: BigDecimal,
  feeValue: BigDecimal
): void {
  log.warning('WWWWWWWWWW ---- started update ptx with id {}', [poolTx])
  log.warning('updatePoolTransactionToken({}, {} , {} , {} , {}}', [
    poolTx,
    poolTokenId,
    amount.toString(),
    balance.toString(),
    feeValue.toString()
  ])
  const ptx = PoolTransaction.load(poolTx)
  const poolToken = PoolToken.load(poolTokenId)
  const pool = PoolEntity.load(poolToken.poolId)
  if (!ptx) {
    log.error('Cannot load PoolTransaction {}', [poolTx])
    return
  }
  if (!poolToken) {
    log.error('Cannot load PoolToken {}', [poolTokenId])
    return
  }
  if (!pool) {
    log.error('Cannot load PoolEntity {}', [poolToken.poolId])
    return
  }
  const ptxTokenValuesId = poolTx.concat('-').concat(poolToken.tokenAddress)
  let ptxTokenValues = PoolTransactionTokenValues.load(ptxTokenValuesId)
  if (ptxTokenValues == null) {
    ptxTokenValues = new PoolTransactionTokenValues(ptxTokenValuesId)
    log.warning('created PoolTransactionTokenValues for {}', [ptxTokenValuesId])
  }
  ptxTokenValues.txId = poolTx
  ptxTokenValues.poolToken = poolTokenId
  ptxTokenValues.poolAddress = poolToken.poolId
  ptxTokenValues.userAddress = ptx.userAddress
  ptxTokenValues.tokenAddress = PoolToken.load(poolTokenId).tokenAddress

  ptxTokenValues.value = amount
  ptxTokenValues.tokenReserve = balance
  ptxTokenValues.feeValue = feeValue
  if (amount.lt(ZERO_BD)) {
    ptxTokenValues.type = 'out'
  } else {
    ptxTokenValues.type = 'in'
  }

  ptxTokenValues.save()
  log.warning('ptxTokenValues {} saved', [ptxTokenValues.id])
  if (ptxTokenValues.tokenAddress == OCEAN) {
    const factory = PoolFactory.load('1')
    factory.totalOceanLiquidity =
      factory.totalOceanLiquidity +
      ptxTokenValues.tokenReserve -
      pool.oceanReserve
    if (factory.totalOceanLiquidity < ZERO_BD || pool.oceanReserve < ZERO_BD) {
      log.warning(
        'EEEEEEEEEEEEEEEEE totalOceanLiquidity or oceanReserve < Zero: pool={}, totOcnLiq={}, ocnRes={}',
        [
          pool.id,
          factory.totalOceanLiquidity.toString(),
          pool.oceanReserve.toString()
        ]
      )
    }
    ptx.oceanReserve = ptxTokenValues.tokenReserve
    pool.oceanReserve = ptxTokenValues.tokenReserve
    factory.save()
  } else {
    ptx.datatokenReserve = ptxTokenValues.tokenReserve
    pool.datatokenReserve = ptxTokenValues.tokenReserve
  }
  // debuglog('########## updatePoolTransactionToken: ', null, [
  //   BigInt.fromI32(ptx.block).toString(),
  //   BigInt.fromI32(ptx.timestamp).toString(),
  //   ptxTokenValues.type,
  //   ptxTokenValues.value.toString(),
  //   ptxTokenValues.tokenReserve.toString(),
  //   poolToken.poolId
  // ])
  log.warning('saving ptx {} ', [ptx.id.toString()])
  ptx.save()
  log.warning('saving pool {} ', [pool.id.toString()])
  pool.save()
}

export function calcSpotPrice(
  balanceIn: BigDecimal,
  wIn: BigDecimal,
  balanceOut: BigDecimal,
  wOut: BigDecimal,
  swapFee: BigDecimal
): BigDecimal {
  if (balanceIn <= ZERO_BD || balanceOut <= ZERO_BD) return MINUS_1_BD
  debuglog('################ calcSpotPrice', null, [
    balanceIn.toString(),
    wIn.toString(),
    balanceOut.toString(),
    wOut.toString(),
    swapFee.toString()
  ])

  const numer = balanceIn.div(wIn)
  const denom = balanceOut.div(wOut)
  if (denom <= ZERO_BD) return MINUS_1_BD

  const ratio = numer.div(denom)
  const scale = ONE_BD.div(ONE_BD.minus(swapFee))
  const price = ratio.times(scale)
  price.truncate(18)
  debuglog('################ calcSpotPrice values:', null, [
    numer.toString(),
    denom.toString(),
    ratio.toString(),
    scale.toString(),
    price.toString()
  ])
  return price
}

export function createPoolTransaction(
  event: ethereum.Event,
  // eslint-disable-next-line camelcase
  event_type: string,
  userAddress: string
): void {
  const poolId = event.address.toHex()
  const pool = PoolEntity.load(poolId)
  const ptx = event.transaction.hash.toHexString()

  const ocnToken = PoolToken.load(poolId.concat('-').concat(OCEAN))
  const dtToken = PoolToken.load(
    poolId.concat('-').concat(pool.datatokenAddress)
  )
  if (ocnToken == null || dtToken == null) {
    return
  }

  let poolTx = PoolTransaction.load(ptx)
  if (poolTx != null) {
    return
  }
  poolTx = new PoolTransaction(ptx)

  poolTx.poolAddress = poolId
  poolTx.userAddress = userAddress
  poolTx.poolAddressStr = poolId
  poolTx.userAddressStr = userAddress

  poolTx.sharesTransferAmount = ZERO_BD
  poolTx.sharesBalance = ZERO_BD

  // pool.datatokenReserve = dtToken.balance
  // pool.oceanReserve = ocnToken.balance
  // Initial reserve values, will be updated in `updatePoolTransactionToken`
  poolTx.datatokenReserve = dtToken.balance
  poolTx.oceanReserve = ocnToken.balance

  const p = Pool.bind(Address.fromString(poolId))
  const priceResult = p.try_calcInGivenOut(
    decimalToBigInt(ocnToken.balance),
    decimalToBigInt(ocnToken.denormWeight),
    decimalToBigInt(dtToken.balance),
    decimalToBigInt(dtToken.denormWeight),
    ONE_BASE_18,
    decimalToBigInt(pool.swapFee)
  )
  debuglog(
    'createPoolTransaction args to calcInGivenOut (ocnBalance, ocnWeight, dtBalance, dtWeight, dtAmount, swapFee, result)',
    null,
    [
      decimalToBigInt(ocnToken.balance).toString(),
      decimalToBigInt(ocnToken.denormWeight).toString(),
      decimalToBigInt(dtToken.balance).toString(),
      decimalToBigInt(dtToken.denormWeight).toString(),
      ONE_BASE_18.toString(),
      decimalToBigInt(pool.swapFee).toString(),
      priceResult.reverted ? 'failed' : priceResult.value.toString()
    ]
  )
  poolTx.consumePrice = priceResult.reverted
    ? MINUS_1_BD
    : bigIntToDecimal(priceResult.value, 18)
  poolTx.spotPrice = calcSpotPrice(
    ocnToken.balance,
    ocnToken.denormWeight,
    dtToken.balance,
    dtToken.denormWeight,
    pool.swapFee
  )

  pool.consumePrice = poolTx.consumePrice
  pool.spotPrice = poolTx.spotPrice
  const oldValueLocked = pool.valueLocked
  const spotPrice = pool.spotPrice >= ZERO_BD ? pool.spotPrice : ZERO_BD
  pool.valueLocked = poolTx.oceanReserve + poolTx.datatokenReserve * spotPrice
  const factory = PoolFactory.load('1')
  if (oldValueLocked < ZERO_BD || pool.valueLocked < ZERO_BD) {
    log.warning(
      'EEEEEEEEEEEEEEEEE valueLocked < Zero: pool={}, oldVL={}, newVL={}, OCEAN={}, DT={}, spotPrice={}',
      [
        pool.id,
        oldValueLocked.toString(),
        pool.valueLocked.toString(),
        poolTx.oceanReserve.toString(),
        poolTx.datatokenReserve.toString(),
        pool.spotPrice.toString()
      ]
    )
  }
  factory.totalValueLocked =
    factory.totalValueLocked - oldValueLocked + pool.valueLocked

  pool.transactionCount = pool.transactionCount.plus(BigInt.fromI32(1))

  pool.save()
  factory.save()

  debuglog(
    'updated pool reserves (source, dtBalance, ocnBalance, dtReserve, ocnReserve): ',
    event,
    [
      'createPoolTransaction',
      dtToken.balance.toString(),
      ocnToken.balance.toString(),
      pool.datatokenReserve.toString(),
      pool.oceanReserve.toString()
    ]
  )

  poolTx.tx = event.transaction.hash
  // eslint-disable-next-line camelcase
  poolTx.event = event_type
  poolTx.block = event.block.number.toI32()
  poolTx.timestamp = event.block.timestamp.toI32()
  poolTx.gasUsed = event.transaction.gasUsed.toBigDecimal()
  poolTx.gasPrice = event.transaction.gasPrice.toBigDecimal()

  debuglog('####################### poolTransaction: ', event, [
    ptx,
    BigInt.fromI32(poolTx.block).toString(),
    BigInt.fromI32(poolTx.timestamp).toString(),
    pool.oceanReserve.toString()
  ])

  poolTx.save()
}

export function decrPoolCount(finalized: boolean): void {
  const factory = PoolFactory.load('1')
  factory.poolCount -= 1
  if (finalized) factory.finalizedPoolCount -= 1
  factory.save()
}

export function saveTokenTransaction(
  event: ethereum.Event,
  eventName: string
): void {
  const tx = event.transaction.hash
    .toHexString()
    .concat('-')
    .concat(event.logIndex.toString())
  const userAddress = event.transaction.from.toHex()
  let transaction = TokenTransaction.load(tx)
  if (transaction == null) {
    transaction = new TokenTransaction(tx)
  }
  transaction.event = eventName
  transaction.datatokenAddress = event.address.toHex()
  transaction.userAddress = userAddress
  transaction.gasUsed = event.transaction.gasUsed.toBigDecimal()
  transaction.gasPrice = event.transaction.gasPrice.toBigDecimal()
  transaction.tx = event.transaction.hash
  transaction.timestamp = event.block.timestamp.toI32()
  transaction.block = event.block.number.toI32()
  transaction.save()

  createUserEntity(userAddress)
}

export function updateTokenBalance(
  id: string,
  token: string,
  user: string,
  amount: BigDecimal
): void {
  let tokenBalance = TokenBalance.load(id)
  if (tokenBalance == null) {
    tokenBalance = new TokenBalance(id)
    createUserEntity(user)
    tokenBalance.userAddress = user
    tokenBalance.datatokenId = token
    tokenBalance.balance = ZERO_BD
  }

  tokenBalance.balance = tokenBalance.balance.plus(amount)
  tokenBalance.save()
}
