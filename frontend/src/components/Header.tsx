import { useWallet } from "@/lib/wallet";

export function Header() {
  const { address, isConnected, isWrongNetwork, connect, disconnect, switchNetwork } = useWallet();

  const shortAddr = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : null;

  return (
    <header className="header">
      <div className="header-inner">
        <span className="brand">🔒 Liquidation Protection Challenge</span>

        <div className="header-right">
          {isWrongNetwork && (
            <button className="btn btn-sm btn-warning" onClick={switchNetwork}>
              Wrong Network
            </button>
          )}

          {isConnected ? (
            <div className="wallet">
              <span className="wallet-addr">{shortAddr}</span>
              <button className="link-btn" onClick={disconnect}>
                Disconnect
              </button>
            </div>
          ) : (
            <button className="btn btn-sm btn-primary" onClick={connect}>
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
