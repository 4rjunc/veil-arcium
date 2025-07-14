use arcis_imports::*;

#[encrypted]
mod circuits {
    use arcis_imports::*;

    pub struct BidData {
        pub bidder: u64,
        pub bid: u8, // change to u64
    }

    pub struct BigBidData {
        pub big_bid: u64,
    }

    #[instruction]
    pub fn share_bid_data(
        receiver: Shared,
        input_ctxt: Enc<Shared, BidData>,
    ) -> Enc<Shared, BidData> {
        let input = input_ctxt.to_arcis();
        receiver.from_arcis(input)
    }
}
