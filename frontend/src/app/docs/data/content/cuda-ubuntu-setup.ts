import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "cuda-ubuntu-setup",
  kind: "codenote",
  name: "CUDA Setup on Ubuntu 24.04",
  desc: "Verify CUDA availability, install the CUDA Toolkit compiler (nvcc), configure environment variables, and confirm GPU access from Python.",
  intro:
    "Install and verify CUDA on Ubuntu 24.04 with an NVIDIA GPU and a working driver. The driver alone provides nvidia-smi and the CUDA runtime, but the Toolkit (nvcc and development tools) is a separate install. This page covers both and confirms GPU access from Python.",
  sections: [
    {
      title: "Verify the driver and CUDA runtime",
      blocks: [
        {
          kind: "text",
          text: [
            "Confirm the GPU driver is working. The CUDA Version field shows the maximum runtime version supported by the driver, not proof that the CUDA Toolkit is installed.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nvidia-smi`,
        },
        {
          kind: "text",
          text: ["Expected output includes a line similar to:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `Driver Version: 590.xx  CUDA Version: 13.1  GPU: NVIDIA GeForce RTX 3060`,
        },
      ],
    },
    {
      title: "Check if the CUDA compiler exists",
      blocks: [
        {
          kind: "text",
          text: [
            "If nvcc is missing, the CUDA Toolkit is not yet installed and the next steps apply.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nvcc --version`,
        },
        {
          kind: "text",
          text: ["When the Toolkit is missing, the output is:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `Command 'nvcc' not found`,
        },
      ],
    },
    {
      title: "Add the NVIDIA CUDA repository",
      blocks: [
        {
          kind: "text",
          text: [
            "On Ubuntu 24.04, CUDA packages require the NVIDIA CUDA apt repository. Add the keyring and refresh the package index.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt update`,
        },
      ],
    },
    {
      title: "Install the CUDA Toolkit",
      blocks: [
        {
          kind: "text",
          text: ["Install the Toolkit. This brings in nvcc and supporting development tools."],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo apt install cuda-toolkit-13-1`,
        },
      ],
    },
    {
      title: "Configure environment variables",
      blocks: [
        {
          kind: "text",
          text: [
            "Append the CUDA bin and lib64 directories to PATH and LD_LIBRARY_PATH. This makes nvcc available on the command line and lets the dynamic linker find the CUDA shared libraries.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `echo 'export PATH=/usr/local/cuda-13.1/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda-13.1/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc`,
        },
        {
          kind: "text",
          text: ["Reload the shell configuration and clear the command hash table so the new nvcc path resolves immediately."],
        },
        {
          kind: "code",
          language: "bash",
          code: `source ~/.bashrc
hash -r`,
        },
        {
          kind: "text",
          text: ["Confirm the install."],
        },
        {
          kind: "code",
          language: "bash",
          code: `nvcc --version`,
        },
        {
          kind: "text",
          text: ["Expected output:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `Cuda compilation tools, release 13.1`,
        },
      ],
    },
    {
      title: "Verify CUDA from Python",
      blocks: [
        {
          kind: "text",
          text: ["Activate the project virtual environment and run a quick check that PyTorch sees the GPU."],
        },
        {
          kind: "code",
          language: "bash",
          code: `source venv/bin/activate`,
        },
        {
          kind: "code",
          language: "python",
          code: `import torch

print("torch version:", torch.__version__)
print("cuda available:", torch.cuda.is_available())
print("cuda device count:", torch.cuda.device_count())

if torch.cuda.is_available():
    print("gpu name:", torch.cuda.get_device_name(0))
    print("cuda capability:", torch.cuda.get_device_capability(0))`,
        },
        {
          kind: "code",
          language: "bash",
          code: `python3 cuda_test.py`,
        },
        {
          kind: "text",
          text: ["Expected output:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `torch version: 2.10.0+cu126
cuda available: True
cuda device count: 1
gpu name: NVIDIA ...
cuda capability: (8, 6)`,
        },
      ],
    },
  ],
}

export default entry