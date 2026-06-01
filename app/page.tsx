export default function HomePage() {
  return (
    <main className="min-h-screen bg-background px-6 py-8 text-primary">
      <section className="mx-auto max-w-6xl">
        <p className="text-sm font-medium text-accent">ScholarInbox</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal">
          个人论文阅读收件箱
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
          第一版将支持 arXiv 日期范围抓取、论文入库、列表查看和收藏。
        </p>
      </section>
    </main>
  );
}
