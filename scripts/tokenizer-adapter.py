"""Code-only IFEval tokenization adaptation; no pretrained model assets.

Sentence splitting uses the fixed Google Research module's existing regex
implementation. Capital-word counting uses Apache-2.0 NLTK Treebank code.
"""
from instruction_following_eval import instructions_util
from nltk.tokenize import TreebankWordTokenizer

def install():
    instructions_util.count_sentences = lambda text: len(instructions_util.split_into_sentences(text))
    instructions_util.nltk.word_tokenize = TreebankWordTokenizer().tokenize
