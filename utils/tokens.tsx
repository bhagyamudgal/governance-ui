import {
  Keypair,
  Connection,
  PublicKey,
  TransactionInstruction,
  Commitment,
} from '@solana/web3.js'
import {
  AccountInfo,
  MintInfo,
  MintLayout,
  Token,
  u64,
} from '@solana/spl-token'
import {
  MintMaxVoteWeightSource,
  MintMaxVoteWeightSourceType,
} from '@solana/spl-governance'
import { chunks } from './helpers'
import { getAccountName, WSOL_MINT } from '@components/instructions/tools'
import { formatMintNaturalAmountAsDecimal } from '@tools/sdk/units'
import tokenPriceService from './services/tokenPrice'
import { BN } from '@coral-xyz/anchor'
import { abbreviateAddress } from './formatting'
import BigNumber from 'bignumber.js'
import { AssetAccount } from '@utils/uiTypes/assets'
import { parseTokenAccountData } from './parseTokenAccountData'

export type TokenAccount = AccountInfo & {
  extensions?: any[]
  isToken2022?: boolean
}

export type MintAccount = MintInfo

export type TokenProgramAccount<T> = {
  publicKey: PublicKey
  account: T
}

export async function getOwnedTokenAccounts(
  connection: Connection,
  publicKey: PublicKey,
): Promise<TokenProgramAccount<TokenAccount>[]> {
  const result = await connection.getTokenAccountsByOwner(publicKey, {
    programId: TOKEN_PROGRAM_ID,
  })

  return result.value.map((r) => {
    const publicKey = r.pubkey
    const data = Buffer.from(r.account.data)
    const account = parseTokenAccountData(publicKey, data)
    return { publicKey, account }
  })
}

/** @deprecated -- use react-query by pubkey */
export const getTokenAccountsByMint = async (
  connection: Connection,
  mint: string,
): Promise<TokenProgramAccount<TokenAccount>[]> => {
  const results = await connection.getProgramAccounts(TOKEN_PROGRAM_ID, {
    filters: [
      {
        dataSize: 165,
      },
      {
        memcmp: {
          offset: 0,
          bytes: mint,
        },
      },
    ],
  })
  return results.map((r) => {
    const publicKey = r.pubkey
    const data = Buffer.from(r.account.data)
    const account = parseTokenAccountData(publicKey, data)
    return { publicKey, account }
  })
}

/** @deprecated, probably */
export async function tryGetMint(
  connection: Connection,
  publicKey: PublicKey,
): Promise<TokenProgramAccount<MintAccount> | undefined> {
  try {
    const result = await connection.getAccountInfo(publicKey)
    const data = Buffer.from(result!.data)
    const account = parseMintAccountData(data)
    return {
      publicKey,
      account,
    }
  } catch (ex) {
    console.error(
      `Can't fetch mint ${publicKey?.toBase58()} @ ${connection.rpcEndpoint}`,
      ex,
    )
    return undefined
  }
}

/** @deprecated -- use react-query by pubkey */
export async function tryGetTokenAccount(
  connection: Connection,
  publicKey: PublicKey,
): Promise<TokenProgramAccount<TokenAccount> | undefined> {
  try {
    const result = await connection.getAccountInfo(publicKey)

    if (!result?.owner.equals(TOKEN_PROGRAM_ID)) {
      return undefined
    }

    const data = Buffer.from(result!.data)
    const account = parseTokenAccountData(publicKey, data)
    return {
      publicKey,
      account,
    }
  } catch (ex) {
    // This is Try method and is expected to fail and hence logging is uneccesery
    // console.error(`Can't fetch token account ${publicKey?.toBase58()}`, ex)
  }
}

/** @deprecated -- use react-query by pubkey */
export async function tryGetTokenMint(
  connection: Connection,
  publicKey: PublicKey,
): Promise<TokenProgramAccount<MintAccount> | undefined> {
  const tokenAccount = await tryGetTokenAccount(connection, publicKey)
  return tokenAccount && tryGetMint(connection, tokenAccount.account.mint)
}

// copied from @solana/spl-token
/** @deprecated -- why? just import from spl-token? */
export const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
)
export const BPF_UPGRADE_LOADER_ID = new PublicKey(
  'BPFLoaderUpgradeab1e11111111111111111111111',
)

/** @deprecated -- why not just use the normal mint layout? */
export function parseMintAccountData(data: Buffer): MintAccount {
  const mintInfo = MintLayout.decode(data)
  if (mintInfo.mintAuthorityOption === 0) {
    mintInfo.mintAuthority = null
  } else {
    mintInfo.mintAuthority = new PublicKey(mintInfo.mintAuthority)
  }

  mintInfo.supply = u64.fromBuffer(mintInfo.supply)
  mintInfo.isInitialized = mintInfo.isInitialized != 0

  if (mintInfo.freezeAuthorityOption === 0) {
    mintInfo.freezeAuthority = null
  } else {
    mintInfo.freezeAuthority = new PublicKey(mintInfo.freezeAuthority)
  }
  return mintInfo
}

export function approveTokenTransfer(
  instructions: TransactionInstruction[],
  cleanupInstructions: TransactionInstruction[],
  account: PublicKey,
  owner: PublicKey,
  amount: number | u64,
  autoRevoke = true,

  // if delegate is not passed ephemeral transfer authority is used
  delegate?: PublicKey,
  existingTransferAuthority?: Keypair,
): Keypair {
  const tokenProgram = TOKEN_PROGRAM_ID
  const transferAuthority = existingTransferAuthority || new Keypair()

  // Coerce amount to u64 in case it's deserialized as BN which differs by buffer conversion functions only
  // Without the coercion createApproveInstruction would fail because it won't be able to serialize it
  if (typeof amount !== 'number') {
    amount = new u64(amount.toArray())
  }

  instructions.push(
    Token.createApproveInstruction(
      tokenProgram,
      account,
      delegate ?? transferAuthority.publicKey,
      owner,
      [],
      amount,
    ),
  )

  if (autoRevoke) {
    cleanupInstructions.push(
      Token.createRevokeInstruction(tokenProgram, account, owner, []),
    )
  }

  return transferAuthority
}

export async function getMultipleAccountInfoChunked(
  connection: Connection,
  keys: PublicKey[],
  commitment: Commitment | undefined = 'recent',
) {
  return (
    await Promise.all(
      chunks(keys, 99).map((chunk) =>
        connection.getMultipleAccountsInfo(chunk, commitment),
      ),
    )
  ).flat()
}

//TODO refactor both methods (getMintAccountLabelInfo, getTokenAccountLabelInfo) make it more common
/** @deprecated */
export function getTokenAccountLabelInfo(acc: AssetAccount | undefined) {
  let tokenAccount = ''
  let tokenName = ''
  let tokenAccountName = ''
  let amount = ''
  let imgUrl = ''

  if (acc?.extensions.token && acc.extensions.mint) {
    const info = tokenPriceService.getTokenInfo(
      acc.extensions!.mint!.publicKey.toBase58(),
    )
    imgUrl = info?.logoURI ? info.logoURI : ''
    tokenAccount = acc.extensions.token.publicKey.toBase58()
    tokenName = info?.name
      ? info.name
      : abbreviateAddress(acc.extensions.mint.publicKey)
    tokenAccountName = getAccountName(acc.extensions.token.publicKey)
    amount = formatMintNaturalAmountAsDecimal(
      acc.extensions.mint!.account,
      acc.extensions.token?.account.amount,
    )
  }
  return {
    tokenAccount,
    tokenName,
    tokenAccountName,
    amount,
    imgUrl,
  }
}

/** @deprecated because i dont think i like the AssetAccount abstraction */
export function getSolAccountLabel(acc: AssetAccount | undefined) {
  let tokenAccount = ''
  let tokenName = ''
  let tokenAccountName = ''
  let amount = ''
  let imgUrl = ''

  if (acc?.extensions.mint) {
    const info = tokenPriceService.getTokenInfo(WSOL_MINT)
    imgUrl = info?.logoURI ? info.logoURI : ''
    tokenAccount = acc.extensions.transferAddress!.toBase58()
    tokenName = 'SOL'

    tokenAccountName = acc.extensions.transferAddress
      ? getAccountName(acc.extensions.transferAddress)
      : ''
    amount = formatMintNaturalAmountAsDecimal(
      acc.extensions.mint!.account,
      new BN(acc.extensions.solAccount!.lamports),
    )
  }
  return {
    tokenAccount,
    tokenName,
    tokenAccountName,
    amount,
    imgUrl,
  }
}

/** @deprecated because i dont think i like the AssetAccount abstraction */
export function getMintAccountLabelInfo(acc: AssetAccount | undefined) {
  let account = ''
  let tokenName = ''
  let mintAccountName = ''
  let amount = ''
  let imgUrl = ''
  if (acc?.extensions.mint && acc.governance) {
    const info = tokenPriceService.getTokenInfo(acc.pubkey.toBase58())
    imgUrl = info?.logoURI ? info.logoURI : ''
    account = acc.pubkey.toBase58()
    tokenName = info?.name ? info.name : ''
    mintAccountName = getAccountName(acc.pubkey)
    amount = formatMintNaturalAmountAsDecimal(
      acc.extensions.mint.account,
      acc?.extensions.mint.account.supply,
    )
  }
  return {
    account,
    tokenName,
    mintAccountName,
    amount,
    imgUrl,
  }
}

/** @deprecated why? */
export type AccountInfoGen<T> = {
  executable: boolean
  owner: PublicKey
  lamports: number
  data: T
  rentEpoch?: number
}

export const parseMintSupplyFraction = (fraction: string) => {
  if (!fraction) {
    return MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION
  }

  const fractionValue = new BigNumber(fraction)
    .shiftedBy(MintMaxVoteWeightSource.SUPPLY_FRACTION_DECIMALS)
    .toNumber()

  return new MintMaxVoteWeightSource({
    type: MintMaxVoteWeightSourceType.SupplyFraction,
    value: new BN(fractionValue),
  })
}

const SCALED_FACTOR_SHIFT = 9

export function getScaledFactor(amount: number) {
  return new BN(
    new BigNumber(amount.toString()).shiftedBy(SCALED_FACTOR_SHIFT).toString(),
  )
}

export function getInverseScaledFactor(amount: BN) {
  return new BigNumber(amount.toNumber())
    .shiftedBy(-SCALED_FACTOR_SHIFT)
    .toNumber()
}
