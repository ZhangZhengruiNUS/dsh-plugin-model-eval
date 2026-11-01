"""Development-only port, pinned row73 /1599_I (CC-BY-4.0).
Accepted solutions[2], language2 SHA256
16c27eb0ca1d78aa692fec0037d7262138a43c2904ec457cd8b883e624b93909.
Sliding window maintains cactus multigraph via link-cut tree. Tree edges are
tagged by the sole non-tree edge whose cycle covers them. Reject any new cycle
whose path already has a tag. On deleting a tagged tree edge promote that
cycle's non-tree edge. Parallel-edge two-cycles are supported explicitly.
"""
import sys
from array import array

class Forest:
    def __init__(self, n, m):
        self.n = n
        size = n+m+1
        self.left = array('i', [0])*size
        self.right = array('i', [0])*size
        self.parent = array('i', [0])*size
        self.rev = bytearray(size)
        self.tag = array('i', [-1])*size
        self.value = array('i', [0])*size
        self.maximum = array('i', [0])*size
        self.count = array('i', [0])*(n+1)+array('i', [1])*m

    def auxroot(self, x):
        p = self.parent[x]
        return not p or (self.left[p] != x and self.right[p] != x)

    def pull(self, x):
        a, b = self.left[x], self.right[x]
        self.count[x] = self.count[a]+self.count[b]+(x > self.n)
        self.maximum[x] = max(self.maximum[a], self.maximum[b], self.value[x])

    def reverse(self, x):
        if x:
            self.left[x], self.right[x] = self.right[x], self.left[x]
            self.rev[x] ^= 1

    def cover(self, x, value):
        if x:
            self.tag[x] = value
            self.value[x] = value if x > self.n else 0
            self.maximum[x] = value if self.count[x] else 0

    def push(self, x):
        if self.rev[x]:
            self.reverse(self.left[x])
            self.reverse(self.right[x])
            self.rev[x] = 0
        if self.tag[x] != -1:
            self.cover(self.left[x], self.tag[x])
            self.cover(self.right[x], self.tag[x])
            self.tag[x] = -1

    def rotate(self, x):
        y = self.parent[x]
        z = self.parent[y]
        d = self.right[y] == x
        b = self.left[x] if d else self.right[x]
        if not self.auxroot(y):
            if self.left[z] == y:
                self.left[z] = x
            else:
                self.right[z] = x
        self.parent[x] = z
        if d:
            self.left[x] = y
            self.right[y] = b
        else:
            self.right[x] = y
            self.left[y] = b
        self.parent[y] = x
        if b:
            self.parent[b] = y
        self.pull(y)
        self.pull(x)

    def splay(self, x):
        chain = [x]
        y = x
        while not self.auxroot(y):
            y = self.parent[y]
            chain.append(y)
        for y in reversed(chain):
            self.push(y)
        while not self.auxroot(x):
            y = self.parent[x]
            z = self.parent[y]
            if not self.auxroot(y):
                if (self.left[y] == x) == (self.left[z] == y):
                    self.rotate(y)
                else:
                    self.rotate(x)
            self.rotate(x)

    def access(self, x):
        last = 0
        y = x
        while y:
            self.splay(y)
            self.right[y] = last
            if last:
                self.parent[last] = y
            self.pull(y)
            last = y
            y = self.parent[y]
        self.splay(x)

    def makeroot(self, x):
        self.access(x)
        self.reverse(x)

    def root(self, x):
        self.access(x)
        while True:
            self.push(x)
            if not self.left[x]:
                break
            x = self.left[x]
        self.splay(x)
        return x

    def path(self, x, y):
        self.makeroot(x)
        self.access(y)

    def cut(self, x, y):
        self.path(x, y)
        assert self.left[y] == x and self.right[x] == 0
        self.left[y] = 0
        self.parent[x] = 0
        self.pull(y)

def solve(n, edges):
    m = len(edges)
    u = array('i', [0])+array('i', (x for x, _ in edges))
    v = array('i', [0])+array('i', (y for _, y in edges))
    f = Forest(n, m)
    is_tree = bytearray(m+1)

    def add(i):
        x, y, node = u[i], v[i], n+i
        f.makeroot(x)
        if f.root(y) != x:
            f.parent[x] = node
            f.parent[node] = y
            is_tree[i] = 1
            return True
        f.path(x, y)
        if f.maximum[y]:
            return False
        f.cover(y, node)
        is_tree[i] = 0
        return True

    def remove(i):
        x, y, node = u[i], v[i], n+i
        f.path(x, y)
        if not is_tree[i]:
            f.cover(y, 0)
            return
        cycle_node = f.maximum[y]
        if cycle_node:
            c = cycle_node-n
            f.path(u[c], v[c])
            f.cover(v[c], 0)
        f.cut(x, node)
        f.cut(y, node)
        is_tree[i] = 0
        if cycle_node:
            c = cycle_node-n
            f.makeroot(u[c])
            f.parent[u[c]] = cycle_node
            f.parent[cycle_node] = v[c]
            is_tree[c] = 1

    left = 1
    answer = 0
    for right in range(1, m+1):
        while not add(right):
            remove(left)
            left += 1
        answer += right-left+1
    return answer

if __name__ == '__main__':
    it = iter(map(int, sys.stdin.buffer.read().split()))
    n, m = next(it), next(it)
    print(solve(n, [(next(it), next(it)) for _ in range(m)]))
