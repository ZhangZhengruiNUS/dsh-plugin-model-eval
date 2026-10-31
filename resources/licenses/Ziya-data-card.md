---
license: apache-2.0
language:
- zh
pretty_name: Ziya-Writing-Eval-Chinese
size_categories:
- n<1K
---
# 姜子牙写作任务中文评估数据集 Ziya-Writing-Eval-Chinese

### 数据介绍 Dataset Summary

用于评估大语言模型在中文写作任务上的水平，通常采用Side-by-Side评测；

本评测集包含了以下几个写作子任务：
- 应用写作
  - 公文
  - 通知
  - 报告
  - 论文
  - 征稿
  - 函件
  - 申请书
- 创意写作
  - 书信
  - 作文
  - 文案
  - 小说
  - 视频脚本
  - 攻略
  - 广告
  - 剧本
  - 童话

This evaluation set is used to assess the proficiency of large language models in Chinese writing tasks, typically through Side-by-Side evaluation.

This evaluation set includes the following writing sub-tasks:
- Application Writing
  - Official documents
  - Notices
  - Reports
  - Papers
  - Call for papers
  - Letters
  - Application letters
- Creative Writing
  - Letters
  - Essays
  - Copywriting
  - Novels
  - Video scripts
  - Guides
  - Advertisements
  - Scripts
  - Fairy tales

### 语言 Languages

中文

Chinese

### 数据示例 Data Instances

```json
{"question_id":"161", "text":"以大学生的视角，写一篇针对某位男大学生运动员铅球的通讯稿，200字左右，要求慷慨激昂，富有文采，彰显出男运动员的青春与矫健，段落节奏抑扬n
顿挫", "category": "写作"}
```


### 引用 Citation

```
@article{fengshenbang,
  author    = {Jiaxing Zhang and Ruyi Gan and Junjie Wang and Yuxiang Zhang and Lin Zhang and Ping Yang and Xinyu Gao and Ziwei Wu and Xiaoqun Dong and Junqing He and Jianheng Zhuo and Qi Yang and Yongfeng Huang and Xiayu Li and Yanghan Wu and Junyu Lu and Xinyu Zhu and Weifeng Chen and Ting Han and Kunhao Pan and Rui Wang and Hao Wang and Xiaojun Wu and Zhongshen Zeng and Chongpei Chen},
  title     = {Fengshenbang 1.0: Being the Foundation of Chinese Cognitive Intelligence},
  journal   = {CoRR},
  volume    = {abs/2209.02970},
  year      = {2022}
}
```
