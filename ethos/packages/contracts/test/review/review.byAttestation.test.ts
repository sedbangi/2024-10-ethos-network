import { type HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';
import { loadFixture } from '@nomicfoundation/hardhat-toolbox/network-helpers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { zeroAddress } from 'viem';
import { type EthosAttestation, type EthosProfile, type EthosReview } from '../../typechain-types';
import { common } from '../utils/common';
import { DEFAULT } from '../utils/defaults';
import { createDeployer, type EthosDeployer } from '../utils/deployEthos';
import { type EthosUser } from '../utils/ethosUser';

describe('EthosReview by Attestation', () => {
  let deployer: EthosDeployer;
  let userB: EthosUser;
  let ethosProfile: EthosProfile;
  let ethosAttestation: EthosAttestation;
  let ethosReview: EthosReview;

  let EXPECTED_SIGNER: HardhatEthersSigner;

  const Score = {
    Negative: 0,
    Neutral: 1,
    Positive: 2,
  };

  type AttestationDetails = {
    account: string;
    service: string;
  };

  const defaultComment = 'default comment';
  const defaultMetadata = JSON.stringify({ itemKey: 'item value' });

  const SERVICE_X = 'x.com';
  // const SERVICE_FB = 'fb.com';

  const ACCOUNT_NAME_BEN = 'benwalther256';
  // const ACCOUNT_NAME_IVAN = 'ivansolo512';

  beforeEach(async () => {
    deployer = await loadFixture(createDeployer);

    userB = await deployer.createUser();
    EXPECTED_SIGNER = deployer.EXPECTED_SIGNER;

    if (!deployer.ethosVouch.contract) {
      throw new Error('EthosVouch contract not found');
    }
    ethosProfile = deployer.ethosProfile.contract;
    ethosAttestation = deployer.ethosAttestation.contract;
    ethosReview = deployer.ethosReview.contract;
  });

  it('should create mock ID for attestation that does not exist', async () => {
    const params = {
      score: Score.Positive,
      subject: ethers.ZeroAddress,
      paymentToken: ethers.ZeroAddress,
      comment: defaultComment,
      metadata: defaultMetadata,
      attestationDetails: {
        account: ACCOUNT_NAME_BEN,
        service: SERVICE_X,
      } satisfies AttestationDetails,
    };
    const reviewPrice = ethers.parseEther('0.23456789');

    await ethosReview
      .connect(userB.signer)
      .addReview(
        params.score,
        params.subject,
        params.paymentToken,
        params.comment,
        params.metadata,
        params.attestationDetails,
        { value: reviewPrice },
      );

    const aHash = await ethosAttestation.getServiceAndAccountHash(SERVICE_X, ACCOUNT_NAME_BEN);
    const id = await ethosProfile.profileIdByAttestation(aHash);
    expect(id).to.be.equal(3);
  });

  it('should emit ReviewCreated event with correct params, if _subject == address(0)', async () => {
    const params = {
      score: Score.Positive,
      subject: ethers.ZeroAddress,
      paymentToken: ethers.ZeroAddress,
      comment: defaultComment,
      metadata: defaultMetadata,
      attestationDetails: {
        account: ACCOUNT_NAME_BEN,
        service: SERVICE_X,
      } satisfies AttestationDetails,
    };
    const reviewPrice = ethers.parseEther('0.23456789');
    const aHash = await ethosAttestation.getServiceAndAccountHash(SERVICE_X, ACCOUNT_NAME_BEN);
    const userBAddr = await userB.signer.getAddress();

    await expect(
      ethosReview
        .connect(userB.signer)
        .addReview(
          params.score,
          params.subject,
          params.paymentToken,
          params.comment,
          params.metadata,
          params.attestationDetails,
          { value: reviewPrice },
        ),
    )
      .to.emit(ethosReview, 'ReviewCreated')
      .withArgs(Score.Positive, userBAddr, aHash, ethers.ZeroAddress, 0, 3);
  });

  it('should emit ReviewCreated event with correct params, if review is not for attestation', async () => {
    const signerAddr = await EXPECTED_SIGNER.getAddress();
    const params = {
      score: Score.Positive,
      subject: signerAddr,
      paymentToken: ethers.ZeroAddress,
      comment: defaultComment,
      metadata: defaultMetadata,
      attestationDetails: {
        account: '',
        service: '',
      } satisfies AttestationDetails,
    };
    const reviewPrice = ethers.parseEther('0.23456789');
    const userBAddr = await userB.signer.getAddress();
    const zeroHash = '0x0000000000000000000000000000000000000000000000000000000000000000';
    await expect(
      ethosReview
        .connect(userB.signer)
        .addReview(
          params.score,
          params.subject,
          params.paymentToken,
          params.comment,
          params.metadata,
          params.attestationDetails,
          { value: reviewPrice },
        ),
    )
      .to.emit(ethosReview, 'ReviewCreated')
      .withArgs(Score.Positive, userBAddr, zeroHash, signerAddr, 0, 3);
  });

  it('should revert when trying to leave a self-review by alternate attestation', async () => {
    const attestationDetails = {
      account: DEFAULT.ACCOUNT_NAME_EXAMPLE,
      service: DEFAULT.SERVICE_X,
    };
    const signature = await common.signatureForCreateAttestation(
      userB.profileId.toString(),
      '0',
      attestationDetails.account,
      attestationDetails.service,
      DEFAULT.ATTESTATION_EVIDENCE_0,
      deployer.EXPECTED_SIGNER,
    );
    await ethosAttestation
      .connect(userB.signer)
      .createAttestation(
        userB.profileId,
        '0',
        attestationDetails,
        DEFAULT.ATTESTATION_EVIDENCE_0,
        signature,
      );
    await expect(userB.review({ attestationDetails }))
      .to.be.revertedWithCustomError(ethosReview, 'SelfReview')
      .withArgs(zeroAddress);
  });
});