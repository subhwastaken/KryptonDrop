"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Listing {
  id: string;
  dropId: string;
  dropName: string;
  sellerAgentId: string;
  sellerHumanId: string;
  claimNftId: string;
  askingPriceUsdc: number;
  originalPriceUsdc: number;
  status: "LISTED" | "SOLD" | "CANCELLED";
  listedAt: string;
  buyerAgentId?: string;
  txHash?: string;
  // ERC-721 on-chain NFT fields
  nftTokenId?: number;
  nftMintTxHash?: string;
  nftTransferTxHash?: string;
}

interface MyVoucher {
  id: string;
  dropId: string;
  dropName: string;
  priceUsdc: string;
  createdAt: string;
  nftTokenId?: number;
}

export default function MarketplacePage() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [myVouchers, setMyVouchers] = useState<MyVoucher[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [currentHumanKey, setCurrentHumanKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [askPrices, setAskPrices] = useState<Record<string, string>>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const res = await fetch("/api/resale/listings");
      if (res.ok) {
        const data = await res.json();
        setListings(data.listings || []);
        setMyVouchers(data.myVouchers || []);
        setSignedIn(data.signedIn);
        setCurrentHumanKey(data.humanKey || null);

        // Prepopulate default asking prices with a 25% markup
        const prices: Record<string, string> = {};
        (data.myVouchers || []).forEach((v: MyVoucher) => {
          const defaultAsk = (Number(v.priceUsdc) * 1.25).toFixed(3);
          prices[v.id] = defaultAsk;
        });
        setAskPrices(prices);
      }
    } catch (err) {
      console.error("Failed to load listings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000); // Poll every 4s to see agent activity
    return () => clearInterval(interval);
  }, []);

  const handleList = async (entryId: string, originalPrice: string) => {
    const askPrice = askPrices[entryId];
    if (!askPrice || isNaN(Number(askPrice)) || Number(askPrice) <= 0) {
      alert("Please enter a valid asking price.");
      return;
    }

    setSubmitting(entryId);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/resale/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryId, askingPrice: Number(askPrice) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to list voucher");

      setStatusMessage(`✅ Compute voucher listed successfully!`);
      fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to list voucher");
    } finally {
      setSubmitting(null);
    }
  };

  const handleBuy = async (listingId: string) => {
    setSubmitting(listingId);
    setStatusMessage(null);

    try {
      const res = await fetch("/api/resale/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to purchase voucher");

      setStatusMessage(`🎉 Voucher purchased successfully! Check the split below.`);
      fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to execute sale");
    } finally {
      setSubmitting(null);
    }
  };

  const completedSales = listings.filter((l) => l.status === "SOLD");

  return (
    <main className="min-h-screen px-5 py-8 sm:px-8 bg-cream text-ink">
      {/* Navigation Header */}
      <header className="mx-auto flex max-w-6xl items-center justify-between border-b-[3px] border-ink pb-4 text-xs font-extrabold uppercase">
        <Link href="/" className="display text-lg sm:text-2xl hover:opacity-80">
          KRYPTON·DROP
        </Link>
        <div className="flex gap-4">
          <Link href="/" className="inline-flex items-center gap-1 border-[3px] border-ink bg-white px-3 py-1.5 text-xs font-extrabold uppercase brutal-hover">
            ← Home
          </Link>
          <span className="pill bg-lime">A2A Compute DEX</span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl py-10 flex flex-col gap-10">
        <div>
          <h1 className="display text-5xl leading-[0.92] sm:text-7xl uppercase">
            Secondary Marketplace
          </h1>
          <p className="text-sm font-bold uppercase mt-2 tracking-widest text-muted-foreground">
            Decentralized Agent-to-Agent Compute Claim Vouchers
          </p>
        </div>

        {statusMessage && (
          <div className="brutal-lime p-4 font-bold border-[3px] border-ink text-sm uppercase">
            {statusMessage}
          </div>
        )}

        {/* 1. LIST MY VOUCHERS */}
        {myVouchers.length > 0 && (
          <section className="flex flex-col gap-4">
            <h2 className="display text-3xl uppercase">✦ My Unlisted Vouchers</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {myVouchers.map((v) => {
                const markup = askPrices[v.id] 
                  ? (((Number(askPrices[v.id]) - Number(v.priceUsdc)) / Number(v.priceUsdc)) * 100).toFixed(0)
                  : "25";
                
                return (
                  <div key={v.id} className="brutal bg-white p-5 flex flex-col gap-4 border-[3px] border-ink">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="text-xs font-extrabold uppercase text-muted-foreground">Claimable Voucher</span>
                        <h3 className="display text-2xl uppercase leading-none mt-1">{v.dropName}</h3>
                      </div>
                      <span className="pill bg-lime font-mono text-sm">${Number(v.priceUsdc).toFixed(1)} MON</span>
                    </div>

                    {/* ERC-721 NFT Graphic */}
                    <svg className="w-full h-24 bg-ink border-[3px] border-ink rounded-none relative overflow-hidden" viewBox="0 0 200 80">
                      <defs>
                        <linearGradient id={`grad-${v.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#84cc16" />
                          <stop offset="50%" stopColor="#10b981" />
                          <stop offset="100%" stopColor="#06b6d4" />
                        </linearGradient>
                      </defs>
                      <line x1="10" y1="10" x2="190" y2="10" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2"/>
                      <line x1="10" y1="40" x2="190" y2="40" stroke="#374151" strokeWidth="0.5"/>
                      <line x1="10" y1="70" x2="190" y2="70" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2"/>
                      <line x1="40" y1="10" x2="40" y2="70" stroke="#374151" strokeWidth="0.5"/>
                      <line x1="160" y1="10" x2="160" y2="70" stroke="#374151" strokeWidth="0.5"/>
                      <rect x="75" y="20" width="50" height="40" fill={`url(#grad-${v.id})`} stroke="#ffffff" strokeWidth="2" rx="4" />
                      <text x="100" y="44" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="monospace">SILICON</text>
                      <path d="M 40,40 L 75,40" stroke="#84cc16" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M 125,40 L 160,40" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round" />
                      <circle cx="40" cy="40" r="3" fill="#84cc16" />
                      <circle cx="160" cy="40" r="3" fill="#06b6d4" />
                      <text x="12" y="22" fill="#84cc16" fontSize="6" fontFamily="monospace">MONAD HARDWARE</text>
                      <text x="12" y="65" fill="#a1a1aa" fontSize="5" fontFamily="monospace">ERC-721 COMPUTE</text>
                      <text x="145" y="22" fill="#a1a1aa" fontSize="5" fontFamily="monospace">
                        {v.nftTokenId ? `TOKEN #${v.nftTokenId}` : `ID: #${v.id.slice(0, 6).toUpperCase()}`}
                      </text>
                    </svg>

                    {/* On-chain NFT link (shows after mint) */}
                    {v.nftTokenId && (
                      <a
                        href={`https://testnet.monadvision.com/token/${process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS || ""}?a=${v.nftTokenId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs font-bold text-lime underline hover:opacity-80"
                      >
                        <span>View NFT #{v.nftTokenId} on MonadVision ↗</span>
                      </a>
                    )}

                    <div className="flex gap-3 items-end">
                      <div className="flex-1">
                        <label className="text-xs font-extrabold uppercase block mb-1">Set Asking Price (MON)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={askPrices[v.id] || ""}
                          onChange={(e) => setAskPrices({ ...askPrices, [v.id]: e.target.value })}
                          className="w-full border-[3px] border-ink px-3 py-2 font-mono text-sm focus:outline-none"
                        />
                      </div>
                      <div className="pb-1">
                        <span className="text-xs font-bold uppercase text-muted-foreground block text-right">ROI markup</span>
                        <span className="text-lg font-extrabold text-lime bg-ink px-2.5 py-1 inline-block border-[3px] border-ink border-l-0">+{markup}%</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleList(v.id, v.priceUsdc)}
                      disabled={submitting === v.id}
                      className="w-full border-[3px] border-ink bg-ink text-cream py-3 text-sm font-extrabold uppercase brutal-hover disabled:opacity-50"
                    >
                      {submitting === v.id ? "Listing..." : "List Voucher for Resale ↗"}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 2. MARKET LISTINGS */}
        <section className="flex flex-col gap-4">
          <h2 className="display text-3xl uppercase">✦ Market Vouchers</h2>
          {loading ? (
            <p className="font-bold uppercase animate-pulse">Loading marketplace listings...</p>
          ) : listings.filter((l) => l.status !== "CANCELLED").length === 0 ? (
            <div className="brutal bg-white p-8 text-center border-[3px] border-ink">
              <p className="font-bold uppercase text-muted-foreground">No vouchers listed on the DEX.</p>
              <p className="text-xs mt-1">Win and purchase drops from the home page, or run scripts to list claim NFTs.</p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {listings.filter((l) => l.status !== "CANCELLED").map((l) => {
                const markup = (((l.askingPriceUsdc - l.originalPriceUsdc) / l.originalPriceUsdc) * 100).toFixed(0);
                const isOwnListing = l.sellerHumanId === currentHumanKey;
                const isSold = l.status === "SOLD";
                return (
                  <div key={l.id} className="brutal bg-white p-5 flex flex-col gap-4 border-[3px] border-ink relative overflow-hidden">
                    <div className={`absolute top-0 right-0 border-b-[3px] border-l-[3px] border-ink px-3 py-1 font-mono text-xs font-extrabold ${isSold ? "bg-ink text-cream" : "bg-lime"}`}>
                      {isSold ? "SOLD" : `+${markup}% ROI`}
                    </div>
                    {isSold && (
                      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-cream/40">
                        <span className="display rotate-[-18deg] border-[4px] border-ink bg-lime px-4 py-1 text-4xl uppercase text-ink shadow-[6px_6px_0_0_#111]">
                          Sold
                        </span>
                      </div>
                    )}
                    <div className="mt-4">
                      <span className="text-xs font-extrabold uppercase text-muted-foreground">Seller: {isOwnListing ? "You (Seller)" : l.sellerAgentId}</span>
                      <h3 className="display text-2xl uppercase mt-1 leading-none">{l.dropName}</h3>
                    </div>

                    {/* ERC-721 NFT Graphic */}
                    <svg className="w-full h-24 bg-ink border-[3px] border-ink rounded-none relative overflow-hidden" viewBox="0 0 200 80">
                      <defs>
                        <linearGradient id={`grad-${l.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#a855f7" />
                          <stop offset="50%" stopColor="#ec4899" />
                          <stop offset="100%" stopColor="#f43f5e" />
                        </linearGradient>
                      </defs>
                      <line x1="10" y1="10" x2="190" y2="10" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2"/>
                      <line x1="10" y1="40" x2="190" y2="40" stroke="#374151" strokeWidth="0.5"/>
                      <line x1="10" y1="70" x2="190" y2="70" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2"/>
                      <line x1="40" y1="10" x2="40" y2="70" stroke="#374151" strokeWidth="0.5"/>
                      <line x1="160" y1="10" x2="160" y2="70" stroke="#374151" strokeWidth="0.5"/>
                      <rect x="75" y="20" width="50" height="40" fill={`url(#grad-${l.id})`} stroke="#ffffff" strokeWidth="2" rx="4" />
                      <text x="100" y="44" fill="#000000" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="monospace">SILICON</text>
                      <path d="M 40,40 L 75,40" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M 125,40 L 160,40" stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round" />
                      <circle cx="40" cy="40" r="3" fill="#a855f7" />
                      <circle cx="160" cy="40" r="3" fill="#f43f5e" />
                      <text x="12" y="22" fill="#a855f7" fontSize="6" fontFamily="monospace">MONAD HARDWARE</text>
                      <text x="12" y="65" fill="#a1a1aa" fontSize="5" fontFamily="monospace">ERC-721 COMPUTE</text>
                      <text x="145" y="22" fill="#a1a1aa" fontSize="5" fontFamily="monospace">
                        {l.nftTokenId ? `TOKEN #${l.nftTokenId}` : `ID: #${l.id.slice(11, 17).toUpperCase()}`}
                      </text>
                    </svg>

                    {/* On-chain NFT explorer link */}
                    {l.nftTokenId && (
                      <a
                        href={`https://testnet.monadvision.com/token/${process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS || ""}?a=${l.nftTokenId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs font-bold text-purple-400 underline hover:opacity-80"
                      >
                        <span>NFT #{l.nftTokenId} on MonadVision ↗</span>
                      </a>
                    )}

                    <div className="grid grid-cols-2 gap-2 border-t-[3px] border-b-[3px] border-ink py-3 my-2 font-mono text-xs">
                      <div>
                        <span className="text-muted-foreground block uppercase font-sans font-extrabold text-[10px]">Original Price</span>
                        <span className="font-bold text-sm">${l.originalPriceUsdc.toFixed(2)} MON</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block uppercase font-sans font-extrabold text-[10px]">Asking Price</span>
                        <span className="font-bold text-sm text-lime bg-ink px-1.5 py-0.5">${l.askingPriceUsdc.toFixed(2)} MON</span>
                      </div>
                    </div>

                    <button
                      onClick={() => handleBuy(l.id)}
                      disabled={isSold || submitting === l.id || isOwnListing}
                      className={`w-full border-[3px] border-ink py-3 text-sm font-extrabold uppercase disabled:opacity-60 ${
                        isSold
                          ? "bg-ink text-cream cursor-not-allowed"
                          : isOwnListing
                          ? "bg-slate-100 text-slate-400 cursor-not-allowed border-slate-300"
                          : "bg-lime text-ink brutal-hover"
                      }`}
                    >
                      {isSold
                        ? `Sold to ${l.buyerAgentId || "buyer"}`
                        : submitting === l.id
                        ? "Processing..."
                        : isOwnListing
                        ? "Your Listing"
                        : "Buy Voucher — pay MON ↗"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 3. TRADE HISTORY / COMPLETED SALES */}
        <section className="flex flex-col gap-4">
          <h2 className="display text-3xl uppercase">✦ Trade Ledger & Profit Splits</h2>
          {completedSales.length === 0 ? (
            <div className="brutal bg-white p-6 border-[3px] border-ink text-center">
              <p className="font-bold uppercase text-muted-foreground text-xs">No completed trades yet.</p>
            </div>
          ) : (
            <div className="brutal bg-white border-[3px] border-ink overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b-[3px] border-ink bg-ink text-cream text-xs uppercase font-extrabold">
                    <th className="p-4">Drop Item</th>
                    <th className="p-4">Buyer</th>
                    <th className="p-4">Cost</th>
                    <th className="p-4">Resold At</th>
                    <th className="p-4">Gross Profit</th>
                    <th className="p-4 bg-lime text-ink">Human Share (90%)</th>
                    <th className="p-4">Agent Gas (10%)</th>
                    <th className="p-4">NFT</th>
                  </tr>
                </thead>
                <tbody className="divide-y-[2px] divide-ink font-mono text-sm font-bold">
                  {completedSales.map((s) => {
                    const profit = s.askingPriceUsdc - s.originalPriceUsdc;
                    const humanShare = profit * 0.90;
                    const agentShare = profit * 0.10;

                    return (
                      <tr key={s.id}>
                        <td className="p-4 font-sans font-bold uppercase">{s.dropName}</td>
                        <td className="p-4 font-mono text-xs">
                          {s.txHash ? (
                            <a
                              href={`https://testnet.monadexplorer.com/tx/${s.txHash}`}
                              target="_blank"
                              rel="noreferrer"
                              className="underline hover:text-lime font-extrabold"
                            >
                              {s.buyerAgentId} ↗
                            </a>
                          ) : (
                            s.buyerAgentId || "—"
                          )}
                        </td>
                        <td className="p-4">${s.originalPriceUsdc.toFixed(3)} MON</td>
                        <td className="p-4 text-lime bg-ink/5">${s.askingPriceUsdc.toFixed(3)} MON</td>
                        <td className="p-4 text-lime">${profit.toFixed(3)} MON</td>
                        <td className="p-4 bg-lime/40 font-extrabold text-lime-700">+${humanShare.toFixed(3)} MON</td>
                        <td className="p-4 text-muted-foreground">+${agentShare.toFixed(3)} MON</td>
                        <td className="p-4 font-mono text-xs">
                          {s.nftTokenId ? (
                            <a
                              href={`https://testnet.monadvision.com/token/${process.env.NEXT_PUBLIC_NFT_CONTRACT_ADDRESS || ""}?a=${s.nftTokenId}`}
                              target="_blank"
                              rel="noreferrer"
                              className="underline hover:text-purple-400 font-extrabold"
                            >
                              NFT #{s.nftTokenId} ↗
                            </a>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
