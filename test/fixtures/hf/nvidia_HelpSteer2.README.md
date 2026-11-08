---
license: cc-by-4.0
language:
- en
pretty_name: HelpSteer2
size_categories:
- 10K<n<100K
tags:
  - human-feedback
---
# HelpSteer2: Open-source dataset for training top-performing reward models


HelpSteer2 is an open-source Helpfulness Dataset (CC-BY-4.0) that supports aligning models to become more helpful, factually correct and coherent, while being adjustable in terms of the complexity and verbosity of its responses.
This dataset has been created in partnership with [Scale  AI](https://scale.com/). 

When used to tune a [Llama 3.1 70B Instruct Model](https://huggingface.co/meta-llama/Llama-3.1-70B-Instruct), we achieve 94.1% on RewardBench, which makes it the best Reward Model as of 1 Oct 2024.
This reward model is available on HuggingFace in both .nemo format at [Llama-3.1-Nemotron-70B-Reward](https://huggingface.co/nvidia/Llama-3.1-Nemotron-70B-Reward) or HF-compatible format at [Llama-3.1-Nemotron-70B-Reward-HF](https://huggingface.co/nvidia/Llama-3.1-Nemotron-70B-Reward-HF)

Using this reward model for RLHF (specifically, REINFORCE), we were able to align a Llama-3.1-70B-Instruct model to reach [AlpacaEval 2 LC](https://tatsu-lab.github.io/alpaca_eval/) of 57.6, [Arena Hard](https://github.com/lmarena/arena-hard-auto) of 85.0 and [GPT-4-Turbo MT-Bench](https://github.com/lm-sys/FastChat/pull/3158) of 8.98, which are known to be predictive of [LMSys Chatbot Arena Elo](https://huggingface.co/spaces/lmsys/chatbot-arena-leaderboard) This Instruct model is available at [Llama-3.1-Nemotron-70B-Instruct](https://huggingface.co/nvidia/Llama-3.1-Nemotron-70B-Instruct) as .nemo model and [Llama-3.1-Nemotron-70B-Instruct-HF](https://huggingface.co/nvidia/Llama-3.1-Nemotron-70B-Instruct-HF) as a HF Transformers model.


See details on HelpSteer2-Preference paper at [https://arxiv.org/abs/2410.01257](https://arxiv.org/abs/2410.01257) - as a preview, this model can correctly the question ```How many r in strawberry?``` without specialized prompting or additional reasoning tokens:

```
A sweet question!
Let’s count the “R”s in “strawberry”:
1. S
2. T
3. R
4. A
5. W
6. B
7. E
8. R
9. R
10. Y
There are **3 “R”s** in the word “strawberry”.
```

Reward Models was trained using the open-source [NeMo Aligner](https://github.com/NVIDIA/NeMo-Aligner).

HelpSteer2 is a follow-up to the popular [HelpSteer](https://huggingface.co/datasets/nvidia/HelpSteer) dataset and we recommend using HelpSteer2 instead of HelpSteer.

HelpSteer2 Paper : [HelpSteer2: Open-source dataset for training top-performing reward models](http://arxiv.org/abs/2406.08673)


## RewardBench Primary Dataset LeaderBoard

