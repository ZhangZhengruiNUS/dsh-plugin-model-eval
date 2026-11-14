---
configs:
- config_name: OE_MM_maths_en_COMP
  data_files: OlympiadBench/OE_MM_maths_en_COMP/OE_MM_maths_en_COMP.parquet
- config_name: OE_MM_maths_zh_CEE
  data_files: OlympiadBench/OE_MM_maths_zh_CEE/OE_MM_maths_zh_CEE.parquet
- config_name: OE_MM_maths_zh_COMP
  data_files: OlympiadBench/OE_MM_maths_zh_COMP/OE_MM_maths_zh_COMP.parquet
- config_name: OE_MM_physics_en_COMP
  data_files: OlympiadBench/OE_MM_physics_en_COMP/OE_MM_physics_en_COMP.parquet
- config_name: OE_MM_physics_zh_CEE
  data_files: OlympiadBench/OE_MM_physics_zh_CEE/OE_MM_physics_zh_CEE.parquet
- config_name: OE_TO_maths_en_COMP
  data_files: OlympiadBench/OE_TO_maths_en_COMP/OE_TO_maths_en_COMP.parquet
- config_name: OE_TO_maths_zh_CEE
  data_files: OlympiadBench/OE_TO_maths_zh_CEE/OE_TO_maths_zh_CEE.parquet
- config_name: OE_TO_maths_zh_COMP
  data_files: OlympiadBench/OE_TO_maths_zh_COMP/OE_TO_maths_zh_COMP.parquet
- config_name: OE_TO_physics_en_COMP
  data_files: OlympiadBench/OE_TO_physics_en_COMP/OE_TO_physics_en_COMP.parquet
- config_name: OE_TO_physics_zh_CEE
  data_files: OlympiadBench/OE_TO_physics_zh_CEE/OE_TO_physics_zh_CEE.parquet
- config_name: TP_MM_maths_en_COMP
  data_files: OlympiadBench/TP_MM_maths_en_COMP/TP_MM_maths_en_COMP.parquet
- config_name: TP_MM_maths_zh_CEE
  data_files: OlympiadBench/TP_MM_maths_zh_CEE/TP_MM_maths_zh_CEE.parquet
- config_name: TP_MM_maths_zh_COMP
  data_files: OlympiadBench/TP_MM_maths_zh_COMP/TP_MM_maths_zh_COMP.parquet
- config_name: TP_MM_physics_en_COMP
  data_files: OlympiadBench/TP_MM_physics_en_COMP/TP_MM_physics_en_COMP.parquet
- config_name: TP_TO_maths_en_COMP
  data_files: OlympiadBench/TP_TO_maths_en_COMP/TP_TO_maths_en_COMP.parquet
- config_name: TP_TO_maths_zh_CEE
  data_files: OlympiadBench/TP_TO_maths_zh_CEE/TP_TO_maths_zh_CEE.parquet
- config_name: TP_TO_maths_zh_COMP
  data_files: OlympiadBench/TP_TO_maths_zh_COMP/TP_TO_maths_zh_COMP.parquet
- config_name: TP_TO_physics_en_COMP
  data_files: OlympiadBench/TP_TO_physics_en_COMP/TP_TO_physics_en_COMP.parquet
license: apache-2.0
task_categories:
- question-answering
- visual-question-answering
language:
- zh
- en
tags:
- math
- physics
pretty_name: olympiadbench
size_categories:
- 10M<n<100M
---

# OlympiadBench: A Challenging Benchmark for Promoting AGI with Olympiad-Level Bilingual Multimodal Scientific Problems[ACL 2024]

[**📖 arXiv**](https://arxiv.org/abs/2402.14008) | [**GitHub**](https://github.com/OpenBMB/OlympiadBench)

**Note**: We have made adjustments to the image content in the multimodal portion of the dataset and fixed previous issues where some images in the English physics subset were not displayed properly. If your usage involves images, please re-download the dataset (we recommend all users to download the latest version).

Additionally, some entries in the solution field may also include images. However, due to image display limitations on Hugging Face, we did not include them in this update. If you need the images embedded in the solution field, please download the full dataset from [**the whole data link**](https://drive.google.com/file/d/1DnTCrvIv5vbfDmi2yYaCWnzUhvD34oB0/view?usp=sharing). This version contains all the original image content.

Thank you for your support of **OlympiadBench** — we hope it is helpful to your work.

## Dataset Description

**OlympiadBench** is an Olympiad-level bilingual multimodal scientific benchmark, featuring 8,476 problems from Olympiad-level mathematics and physics competitions, including the Chinese college entrance exam. Each problem is detailed with expert-level annotations for step-by-step reasoning. Notably, the best-performing model, GPT-4V, attains an average score of 17.97% on OlympiadBench, with a mere 10.74% in physics, highlighting the benchmark rigor and the intricacy of physical reasoning.

More details are at our [GitHub](https://github.com/OpenBMB/OlympiadBench).


## Contact
- Chaoqun He: hechaoqun1998@gmail.com

## Citation

If you do find our code helpful or use our benchmark dataset, please citing our paper.

**BibTeX:**
```bibtex
@article{he2024olympiadbench,
  title={Olympiadbench: A challenging benchmark for promoting agi with olympiad-level bilingual multimodal scientific problems},
  author={He, Chaoqun and Luo, Renjie and Bai, Yuzhuo and Hu, Shengding and Thai, Zhen Leng and Shen, Junhao and Hu, Jinyi and Han, Xu and Huang, Yujie and Zhang, Yuxiang and others},
  journal={arXiv preprint arXiv:2402.14008},
  year={2024}
}
```
