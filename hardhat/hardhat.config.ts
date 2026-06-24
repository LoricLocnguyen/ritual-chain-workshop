import * as dotenv from "dotenv";
dotenv.config();
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.24",
      },
      production: {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.SEPOLIA_PRIVATE_KEY ? [process.env.SEPOLIA_PRIVATE_KEY.startsWith("0x") ? process.env.SEPOLIA_PRIVATE_KEY : "0x" + process.env.SEPOLIA_PRIVATE_KEY] : [],
    },
    ritual: {
      type: "http",
      chainType: "l1",
      url: "https://rpc.ritualfoundation.org",
      chainId: 1979,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY.startsWith("0x") ? process.env.DEPLOYER_PRIVATE_KEY : "0x" + process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      ritual: "empty", // Ritual explorer doesn't require an API key but Hardhat requires this field
      sepolia: "empty"
    },
    customChains: [
      {
        network: "ritual",
        chainId: 1979,
        urls: {
          apiURL: "https://explorer.ritualfoundation.org/api",
          browserURL: "https://explorer.ritualfoundation.org"
        }
      }
    ]
  }
});
