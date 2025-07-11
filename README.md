# VEIL: Blind Auction Battles

A decentralized blind auction platform built on Solana with Arcium's privacy-preserving Multi-Party Computation (MPC) technology. Players compete in psychological warfare where bid amounts remain completely private, creating intense strategic gameplay.

## Core Concept

N number players submit encrypted bids for the same NFT or digital asset. The higher bidder wins, but the losing bid or bidded amount stays completely private. This creates psychological tension where players never know how much they lost by or how much they should bid, adding a unique strategic element to auctions.

## Privacy Technology

Built using **Arcium's MPC network** on Solana:
- Bid amounts are encrypted and processed privately
- No one can see actual bid values until auction ends
- Winner is determined through secure computation
- Losing bids remain forever private

## 🎮 How It Works

### Phase 1: Auction Setup
1. **NFT/Asset Listing**: Seller lists their item with minimum bid and auction duration
2. **Auction Goes Live**: Two bidding slots open for N number players
3. **Public Visibility**: Anyone can see active auctions and participate

### Phase 2: Bidding Process
1. **Deposit Requirement**: Each player must deposit 0.5 SOL to participate
   - Acts as commitment and prevents spam bidding
   - Fully visible on Solana explorer, expect the bid amount
2. **Encrypted Bid Submission**: Players submit their actual bid amounts
   - Bid amounts encrypted through Arcium MPC
3. **Locked Commitment**: Once submitted, bids cannot be changed

### Phase 3: Auction Resolution
1. **Private Computation**: Arcium network determines winner without revealing amounts
2. **Winner Announcement**: Winner is declared publicly
3. **Payment Processing**:
   - **Winner**: Pays their bid amount to seller, gets the NFT, deposit returned
   - **Loser**: Gets deposit back, never learns how much they lost by

### What's Visible vs Private

**Visible on Solana Explorer:**
- Participant wallet addresses
- 0.5 SOL deposit transactions
- Final winner announcement
- NFT transfer to winner
- Payment from winner to seller

**Private (Hidden by Arcium):**
- Actual bid amounts
- Margin of victory/loss
- Bidding patterns and strategies

## User Experience Flow

### For Bidders:
1. Browse active auctions
2. Choose an auction to participate in
3. Deposit 0.5 SOL (visible transaction)
4. Submit encrypted bid amount (private)
5. Wait for auction to end
6. Receive outcome (win/lose) but never learn opponent's bid

### For Sellers:
1. List NFT/asset with minimum bid
2. Set auction duration
3. Wait for bidders to join
4. Auction runs automatically
5. Receive payment from winner
6. NFT transfers to winner

or 

I have another way doing to. Create a nouns like NFT collection -> Daily a new NFT drops with random traits. -> Biders bid bids are private -> Attach some utility to the NFT holders
