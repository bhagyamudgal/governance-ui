import CheckmarkIcon from '@carbon/icons-react/lib/Checkmark';
import ChevronLeftIcon from '@carbon/icons-react/lib/ChevronLeft';
import EditIcon from '@carbon/icons-react/lib/Edit';
import { createInstructionData } from '@solana/spl-governance';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { BigNumber } from 'bignumber.js';
import { hoursToSeconds, secondsToHours } from 'date-fns';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import { getAccountName } from '@components/instructions/tools';
import { useGovernanceByPubkeyQuery } from '@hooks/queries/governance';
import { useMintInfoByPubkeyQuery } from '@hooks/queries/mintInfo';
import { useRealmQuery } from '@hooks/queries/realm';
import useCreateProposal from '@hooks/useCreateProposal';
import useProgramVersion from '@hooks/useProgramVersion';
import useQueryContext from '@hooks/useQueryContext';
import useRealm from '@hooks/useRealm';
import useWalletOnePointOh from '@hooks/useWalletOnePointOh';
import { Primary, Secondary } from '@hub/components/controls/Button';
import cx from '@hub/lib/cx';
import { GovernanceTokenType } from '@hub/types/GovernanceTokenType';
import { GovernanceVoteTipping } from '@hub/types/GovernanceVoteTipping';

import { notify } from '@utils/notifications';

import { createTransaction } from './createTransaction';
import { EditWalletForm } from './Form';
import { EditWalletSummary } from './Summary';
import { CommunityRules, CouncilRules } from './types';

import getGovernanceRules from './utils';

enum Step {
  Form,
  Summary,
}

function stepNum(step: Step): number {
  switch (step) {
    case Step.Form:
      return 1;
    case Step.Summary:
      return 2;
  }
}

function stepName(step: Step): string {
  switch (step) {
    case Step.Form:
      return 'Edit Wallet Rules';
    case Step.Summary:
      return 'Create Proposal';
  }
}

interface Props {
  className?: string;
  governanceAddress: PublicKey;
  realmPk: PublicKey;
}

export function EditWalletRules(props: Props) {
  const { fmtUrlWithCluster } = useQueryContext();
  const wallet = useWalletOnePointOh();
  const { propose } = useCreateProposal();
  const realm = useRealmQuery().data?.result;
  const version = useProgramVersion();
  const communityMint = useMintInfoByPubkeyQuery(realm?.account.communityMint)
    .data?.result;
  const councilMint = useMintInfoByPubkeyQuery(
    realm?.account.config.councilMint,
  ).data?.result;

  const { symbol } = useRealm();
  const { connection } = useConnection();

  const router = useRouter();
  const [step, setStep] = useState(Step.Form);
  const [proposalVoteType, setProposalVoteType] = useState<
    'community' | 'council'
  >('community');
  const [proposalDescription, setProposalDescription] = useState('');
  const [proposalTitle, setProposalTitle] = useState('');
  const [walletName, setWalletName] = useState('');
  const [walletAddress, setWalletAddress] = useState<PublicKey>(
    PublicKey.default,
  );

  const [initialCommunityRules, setInitialCommunityRules] =
    useState<CommunityRules>({
      canCreateProposal: true,
      canVeto: false,
      canVote: false,
      quorumPercent: 1,
      tokenType: GovernanceTokenType.Community,
      // this isn't a valid value, but it's just to satisfy the types for the
      // default initialized value
      tokenMintAddress: props.governanceAddress,
      //tokenMintDecimals: new BigNumber(0),
      //totalSupply: new BigNumber(1),
      vetoQuorumPercent: 100,
      voteTipping: GovernanceVoteTipping.Disabled,
      votingPowerToCreateProposals: new BigNumber(1),
    });
  const [initialCouncilRules, setInitialCouncilRules] =
    useState<CouncilRules>(null);
  const [initialCoolOffHours, setInitialCoolOffHours] = useState(0);
  const [initialBaseVoteDays, setInitialBaseVoteDays] = useState(0);
  const [
    initialDepositExemptProposalCount,
    setInitialDepositExemptProposalCount,
  ] = useState(0);
  const [initialMinInstructionHoldupDays, setInitialMinInstructionHoldupDays] =
    useState(0);

  const [communityRules, setCommunityRules] = useState<CommunityRules>({
    canCreateProposal: true,
    canVeto: false,
    canVote: false,
    quorumPercent: 1,
    tokenType: GovernanceTokenType.Community,
    // this isn't a valid value, but it's just to satisfy the types for the
    // default initialized value
    tokenMintAddress: props.governanceAddress,
    //tokenMintDecimals: new BigNumber(0),
    //totalSupply: new BigNumber(1),
    vetoQuorumPercent: 100,
    voteTipping: GovernanceVoteTipping.Disabled,
    votingPowerToCreateProposals: new BigNumber(1),
  });

  const [councilRules, setCouncilRules] = useState<CouncilRules>(null);
  const [coolOffHours, setCoolOffHours] = useState(0);
  const [depositExemptProposalCount, setDepositExemptProposalCount] =
    useState(0);
  const [baseVoteDays, setBaseVoteDays] = useState(3);
  const [maxVoteDays, setMaxVoteDays] = useState(3);
  const [minInstructionHoldupDays, setMinInstructionHoldupDays] = useState(0);

  const [submitting, setSubmitting] = useState(false);
  const govData = useGovernanceByPubkeyQuery(props.governanceAddress).data
    ?.result;

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0 });
    }
  }, [step]);

  useEffect(() => {
    if (govData && realm) {
      const data = getGovernanceRules(realm.owner, govData, realm);

      const [walletAddress] = PublicKey.findProgramAddressSync(
        [Buffer.from('native-treasury'), govData.pubkey.toBuffer()],
        realm.owner,
      );

      data.communityTokenRules.votingPowerToCreateProposals = communityMint
        ? data.communityTokenRules.votingPowerToCreateProposals.shiftedBy(
            -communityMint.decimals,
          )
        : data.communityTokenRules.votingPowerToCreateProposals;

      if (data.councilTokenRules) {
        data.councilTokenRules.votingPowerToCreateProposals = councilMint
          ? data.councilTokenRules.votingPowerToCreateProposals.shiftedBy(
              -councilMint.decimals,
            )
          : data.councilTokenRules.votingPowerToCreateProposals;
      }

      setCommunityRules(data.communityTokenRules);
      setInitialCommunityRules(data.communityTokenRules);
      setCoolOffHours(data.coolOffHours);
      setInitialCoolOffHours(data.coolOffHours);
      setCouncilRules(data.councilTokenRules);
      setInitialCouncilRules(data.councilTokenRules);
      setDepositExemptProposalCount(data.depositExemptProposalCount);
      setInitialDepositExemptProposalCount(data.depositExemptProposalCount);

      // maxVotingDays is actually misnamed on-chain. It should be `baseVotingDays`
      const baseVotingSeconds = hoursToSeconds(24 * data.maxVoteDays);
      const coolOffSeconds = hoursToSeconds(data.coolOffHours);
      const maxVotingSeconds = baseVotingSeconds + coolOffSeconds;

      setBaseVoteDays(data.maxVoteDays);
      setInitialBaseVoteDays(data.maxVoteDays);

      setMaxVoteDays(maxVotingSeconds / 60 / 60 / 24);
      setMinInstructionHoldupDays(data.minInstructionHoldupDays);
      setInitialMinInstructionHoldupDays(data.minInstructionHoldupDays);

      if (!data.councilTokenRules) {
        setProposalVoteType('community');
      } else if (!data.communityTokenRules.canVote) {
        setProposalVoteType('council');
      }

      const walletName =
        getAccountName(walletAddress) ||
        getAccountName(data.governanceAddress) ||
        walletAddress.toBase58();

      const title = `Update Wallet Rules for “${walletName}”`;

      setProposalTitle(title);
      setWalletName(walletName);
      setWalletAddress(walletAddress);
    }
  }, [govData, realm, communityMint, councilMint]);

  return !wallet?.publicKey ? (
    <div className={cx(props.className, 'dark:bg-neutral-900')}>
      <Head>
        <title>Edit Wallet Rules - {walletName}</title>
        <meta
          property="og:title"
          content={`Edit Wallet Rules - ${walletAddress.toBase58()}`}
          key="title"
        />
      </Head>
      <div className="w-full max-w-3xl pt-14 mx-auto grid place-items-center">
        <div className="my-16 py-8 px-16 dark:bg-black/40 rounded flex flex-col items-center">
          <div className="text-white mb-2 text-center">
            Please sign in to edit wallet rules
            <br />
            for "{walletName}"
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div className={cx(props.className, 'dark:bg-neutral-900')}>
      <div className="w-full max-w-3xl pt-14 mx-auto">
        <Head>
          <title>Edit Wallet Rules - {walletName}</title>
          <meta
            property="og:title"
            content={`Edit Wallet Rules - ${walletAddress.toBase58()}`}
            key="title"
          />
        </Head>
        <div className="flex items-center mt-4">
          <div className="text-sm dark:text-neutral-500">
            Step {stepNum(step)} of 2
          </div>
          <div className="text-sm dark:text-white ml-2">{stepName(step)}</div>
        </div>
        <div className="py-16">
          {step === Step.Form && (
            <>
              <EditWalletForm
                key={communityRules.tokenMintAddress.toBase58()}
                className="mb-16"
                communityRules={communityRules}
                coolOffHours={coolOffHours}
                councilRules={councilRules}
                initialCommunityRules={initialCommunityRules}
                initialCouncilRules={initialCouncilRules}
                depositExemptProposalCount={depositExemptProposalCount}
                governanceAddress={props.governanceAddress}
                maxVoteDays={maxVoteDays}
                minInstructionHoldupDays={minInstructionHoldupDays}
                programVersion={version ?? 3}
                walletAddress={walletAddress}
                onCommunityRulesChange={setCommunityRules}
                onCoolOffHoursChange={(coolOffHours) => {
                  setCoolOffHours(coolOffHours);
                  const maxVotingSeconds = hoursToSeconds(maxVoteDays * 24);
                  const coolOffSeconds = hoursToSeconds(coolOffHours);
                  const baseVotingSeconds = maxVotingSeconds - coolOffSeconds;
                  setBaseVoteDays(secondsToHours(baseVotingSeconds) / 24);
                }}
                onCouncilRulesChange={setCouncilRules}
                onDepositExemptProposalCountChange={
                  setDepositExemptProposalCount
                }
                onMaxVoteDaysChange={(votingDays) => {
                  setMaxVoteDays(votingDays);
                  const maxVotingSeconds = hoursToSeconds(24 * votingDays);
                  const coolOffSeconds = hoursToSeconds(coolOffHours);
                  const baseVotingSeconds = maxVotingSeconds - coolOffSeconds;
                  setBaseVoteDays(secondsToHours(baseVotingSeconds) / 24);
                }}
                onMinInstructionHoldupDaysChange={setMinInstructionHoldupDays}
              />
              <footer className="flex items-center justify-between">
                <button
                  className="flex items-center text-sm text-neutral-500"
                  onClick={() => router.back()}
                >
                  <ChevronLeftIcon className="h-4 fill-current w-4" />
                  Go Back
                </button>
                <Secondary
                  className="h-14 w-44"
                  onClick={() => setStep(Step.Summary)}
                >
                  Continue
                </Secondary>
              </footer>
            </>
          )}
          {step === Step.Summary && (
            <>
              <EditWalletSummary
                className="mb-16"
                communityRules={communityRules}
                coolOffHours={coolOffHours}
                councilRules={councilRules}
                initialCommunityRules={initialCommunityRules}
                initialCoolOffHours={initialCoolOffHours}
                initialCouncilRules={initialCouncilRules}
                initialDepositExemptProposalCount={
                  initialDepositExemptProposalCount
                }
                initialBaseVoteDays={initialBaseVoteDays}
                initialMinInstructionHoldupDays={
                  initialMinInstructionHoldupDays
                }
                depositExemptProposalCount={depositExemptProposalCount}
                governanceAddress={props.governanceAddress}
                baseVoteDays={baseVoteDays}
                minInstructionHoldupDays={minInstructionHoldupDays}
                proposalDescription={proposalDescription}
                proposalTitle={proposalTitle}
                proposalVoteType={proposalVoteType}
                walletAddress={walletAddress}
                onProposalDescriptionChange={setProposalDescription}
                onProposalTitleChange={setProposalTitle}
                onProposalVoteTypeChange={setProposalVoteType}
              />
              <footer className="flex items-center justify-end">
                <button
                  className="flex items-center text-sm text-neutral-500"
                  onClick={() => setStep(Step.Form)}
                >
                  <EditIcon className="h-4 fill-current mr-1 w-4" />
                  Edit Rules
                </button>
                <Primary
                  className="ml-16 h-14 w-44"
                  pending={submitting}
                  onClick={async () => {
                    if (!realm) throw new Error();

                    setSubmitting(true);

                    const instruction = await createTransaction(
                      connection,
                      realm.owner,
                      version ?? 3,
                      props.governanceAddress,
                      realm.pubkey,
                      {
                        coolOffHours,
                        depositExemptProposalCount,
                        maxVoteDays,
                        minInstructionHoldupDays,
                        communityTokenRules: communityRules,
                        councilTokenRules: councilRules,
                        governanceAddress: props.governanceAddress,
                        version: version ?? 3,
                        walletAddress: walletAddress,
                      },
                    );

                    try {
                      const proposalAddress = await propose({
                        title: proposalTitle,
                        description: proposalDescription,
                        voteByCouncil: proposalVoteType === 'council',
                        instructionsData: [
                          {
                            data: createInstructionData(instruction),
                            holdUpTime:
                              60 * 60 * 24 * initialMinInstructionHoldupDays,
                            prerequisiteInstructions: [],
                          },
                        ],
                        governance: props.governanceAddress,
                      });

                      if (proposalAddress) {
                        router.push(
                          fmtUrlWithCluster(
                            `/dao/${symbol}/proposal/${proposalAddress.toBase58()}`,
                          ),
                        );
                      }
                    } catch (e) {
                      notify({
                        type: 'error',
                        message: 'Could not create proposal: ' + String(e),
                      });
                    }

                    setSubmitting(false);
                  }}
                >
                  <CheckmarkIcon className="h-4 fill-current mr-1 w-4" />
                  Create Proposal
                </Primary>
              </footer>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
