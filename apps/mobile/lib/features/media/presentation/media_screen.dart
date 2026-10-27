import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/widgets/tactical_card.dart';
import '../../../core/widgets/pulse_button.dart';
import '../../../core/widgets/tactical_popup.dart';
import '../../../core/widgets/rating_widget.dart';
import '../../citizen/presentation/citizen_controller.dart';
import '../data/media_repository.dart';

final articlesProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(mediaRepositoryProvider);
  return repo.fetchArticles();
});

final myNewspaperProvider = FutureProvider.autoDispose<Map<String, dynamic>?>((ref) async {
  final repo = ref.watch(mediaRepositoryProvider);
  return repo.fetchMyNewspaper();
});

final shoutsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(mediaRepositoryProvider);
  return repo.fetchShouts();
});

final portalsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final repo = ref.watch(mediaRepositoryProvider);
  return repo.fetchPortals();
});

class MediaScreen extends ConsumerStatefulWidget {
  const MediaScreen({super.key});

  @override
  ConsumerState<MediaScreen> createState() => _MediaScreenState();
}

class _MediaScreenState extends ConsumerState<MediaScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final _titleCtrl = TextEditingController();
  final _bodyCtrl = TextEditingController();
  final _newspaperNameCtrl = TextEditingController();
  final _shoutCtrl = TextEditingController();
  final Set<String> _subscribedPortalIds = {};
  final Set<String> _upvotedArticleIds = {};
  String _scope = 'GLOBAL';
  String _filterScope = 'ALL';
  String _avatarColor = '#e8b44a';
  bool _busy = false;

  static const _colors = ['#e8b44a', '#4a7de8', '#4cc38a', '#c9543f', '#8b5cf6', '#06b6d4'];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    _titleCtrl.dispose();
    _bodyCtrl.dispose();
    _newspaperNameCtrl.dispose();
    _shoutCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Media & Press Bureau'),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicatorColor: AppColors.cyan,
          labelColor: AppColors.cyan,
          unselectedLabelColor: AppColors.textMuted,
          tabs: const [
            Tab(text: 'Articles Feed'),
            Tab(text: 'Write Article'),
            Tab(text: 'Live Shouts'),
            Tab(text: 'News Portals'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _buildArticlesTab(),
          _buildPublishTab(),
          _buildShoutsTab(),
          _buildPortalsTab(),
        ],
      ),
    );
  }

  Widget _buildArticlesTab() {
    final articlesAsync = ref.watch(articlesProvider);

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async => ref.invalidate(articlesProvider),
      child: Column(
        children: [
          // Scope filters
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                _filterChip('ALL', 'All Editions'),
                const SizedBox(width: 8),
                _filterChip('GLOBAL', '🌐 Global'),
                const SizedBox(width: 8),
                _filterChip('COUNTRY', '🚩 National'),
              ],
            ),
          ),
          Expanded(
            child: articlesAsync.when(
              data: (articles) {
                final filtered = articles.where((a) {
                  if (_filterScope == 'GLOBAL') return a['scope'] == 'GLOBAL';
                  if (_filterScope == 'COUNTRY') return a['scope'] != 'GLOBAL';
                  return true;
                }).toList();

                if (filtered.isEmpty) {
                  return const Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Text('No articles published in this category.', style: TextStyle(color: AppColors.textMuted)),
                    ),
                  );
                }

                return ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: filtered.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 12),
                  itemBuilder: (context, index) {
                    final a = filtered[index];
                    final id = a['id'] as String;
                    final title = a['title'] as String? ?? '';
                    final body = a['body'] as String? ?? '';
                    final scope = a['scope'] as String? ?? 'GLOBAL';
                    final upvotes = a['upvotes'] as int? ?? 0;
                    final newspaper = a['newspaper'] as Map? ?? {};
                    final npName = newspaper['name'] as String? ?? 'Press';
                    final author = a['author'] as Map? ?? {};
                    final authorName = author['nickname'] as String? ?? 'Citizen';

                    return TacticalCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Row(
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.all(6),
                                      decoration: BoxDecoration(color: AppColors.amber.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(6)),
                                      child: const Text('📰', style: TextStyle(fontSize: 16)),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(npName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13), overflow: TextOverflow.ellipsis),
                                          Text('By $authorName', style: const TextStyle(color: AppColors.textMuted, fontSize: 10), overflow: TextOverflow.ellipsis),
                                        ],
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: scope == 'GLOBAL' ? AppColors.cyan.withValues(alpha: 0.15) : AppColors.emerald.withValues(alpha: 0.15),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(scope, style: TextStyle(color: scope == 'GLOBAL' ? AppColors.cyan : AppColors.emerald, fontSize: 10, fontWeight: FontWeight.bold)),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.textPrimary)),
                          const SizedBox(height: 6),
                          Text(
                            body.replaceAll(RegExp(r'<[^>]*>'), ''),
                            maxLines: 4,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, height: 1.4),
                          ),
                          const SizedBox(height: 12),
                          () {
                            final hasUpvoted = _upvotedArticleIds.contains(id);
                            return Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                OutlinedButton.icon(
                                  icon: Icon(hasUpvoted ? Icons.check_circle_rounded : Icons.thumb_up_rounded, size: 14),
                                  label: Text(hasUpvoted ? '$upvotes Voted ✓' : '$upvotes Votes'),
                                  style: OutlinedButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                    foregroundColor: hasUpvoted ? AppColors.emerald : AppColors.cyan,
                                    side: BorderSide(color: (hasUpvoted ? AppColors.emerald : AppColors.cyan).withValues(alpha: 0.6), width: 0.8),
                                  ),
                                  onPressed: (_busy || hasUpvoted) ? null : () => _upvote(id),
                                ),
                                ElevatedButton.icon(
                                  icon: const Icon(Icons.monetization_on_rounded, size: 14),
                                  label: const Text('Tip 1g'),
                                  style: ElevatedButton.styleFrom(
                                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                    backgroundColor: AppColors.surfaceElevated,
                                    foregroundColor: AppColors.amber,
                                  ),
                                  onPressed: _busy ? null : () => _tip(id),
                                ),
                              ],
                            );
                          }(),
                        ],
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
              error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(articlesProvider))),
            ),
          ),
        ],
      ),
    );
  }

  Widget _filterChip(String scope, String label) {
    final isSelected = _filterScope == scope;
    return ChoiceChip(
      label: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: isSelected ? Colors.black : AppColors.textSecondary)),
      selected: isSelected,
      selectedColor: AppColors.cyan,
      backgroundColor: AppColors.surfaceElevated,
      onSelected: (_) => setState(() => _filterScope = scope),
    );
  }

  Widget _buildPublishTab() {
    final newspaperAsync = ref.watch(myNewspaperProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: newspaperAsync.when(
        data: (paper) {
          if (paper == null) {
            // Need to found newspaper
            return TacticalCard(
              borderColor: AppColors.amber.withValues(alpha: 0.4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(color: AppColors.amber.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(8)),
                        child: const Icon(Icons.newspaper_rounded, color: AppColors.amber, size: 24),
                      ),
                      const SizedBox(width: 12),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Found a Newspaper', style: Theme.of(context).textTheme.titleLarge),
                          const Text('Press License: 20.00 Gold • Level 4+ Required', style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                        ],
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: _newspaperNameCtrl,
                    decoration: const InputDecoration(labelText: 'Newspaper Name', hintText: 'e.g. Daily Dispatch', border: OutlineInputBorder()),
                  ),
                  const SizedBox(height: 14),
                  const Text('Brand Emblem Color:', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                  const SizedBox(height: 8),
                  Row(
                    children: _colors.map((c) {
                      final isSelected = _avatarColor == c;
                      return GestureDetector(
                        onTap: () => setState(() => _avatarColor = c),
                        child: Container(
                          margin: const EdgeInsets.only(right: 8),
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: Color(int.parse(c.replaceFirst('#', '0xff'))),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: isSelected ? Colors.white : Colors.transparent, width: 2),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 20),
                  PulseButton(
                    label: 'Establish Newspaper (20g)',
                    icon: Icons.check_circle_rounded,
                    backgroundColor: AppColors.amber,
                    foregroundColor: Colors.black,
                    onPressed: _busy ? null : _createNewspaper,
                  ),
                ],
              ),
            );
          }

          // Has newspaper: write article
          final paperName = paper['name'] as String? ?? 'My Paper';

          return TacticalCard(
            borderColor: AppColors.cyan.withValues(alpha: 0.4),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Compose Editorial', style: Theme.of(context).textTheme.titleLarge),
                          Text('Publishing under $paperName',
                              style: const TextStyle(color: AppColors.cyan, fontSize: 11, fontWeight: FontWeight.bold),
                              overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    DropdownButton<String>(
                      value: _scope,
                      dropdownColor: AppColors.surfaceCard,
                      underline: const SizedBox.shrink(),
                      items: const [
                        DropdownMenuItem(value: 'GLOBAL', child: Text('🌐 Global', style: TextStyle(fontSize: 12))),
                        DropdownMenuItem(value: 'COUNTRY', child: Text('🚩 National', style: TextStyle(fontSize: 12))),
                      ],
                      onChanged: (val) {
                        if (val != null) setState(() => _scope = val);
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _titleCtrl,
                  decoration: const InputDecoration(labelText: 'Article Headline', hintText: 'Breaking news on the frontline...', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 14),
                TextField(
                  controller: _bodyCtrl,
                  maxLines: 8,
                  decoration: const InputDecoration(labelText: 'Article Body', hintText: 'Write your story...', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 16),
                PulseButton(
                  label: 'Publish to the Press Bureau',
                  icon: Icons.send_rounded,
                  backgroundColor: AppColors.cyan,
                  foregroundColor: Colors.black,
                  onPressed: _busy ? null : _publishArticle,
                ),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
        error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(myNewspaperProvider))),
      ),
    );
  }

  Widget _buildShoutsTab() {
    final shoutsAsync = ref.watch(shoutsProvider);

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async => ref.invalidate(shoutsProvider),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _shoutCtrl,
                    maxLength: 100,
                    decoration: const InputDecoration(
                      hintText: 'Broadcast transmission (max 100 chars)...',
                      isDense: true,
                      border: OutlineInputBorder(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                ElevatedButton(
                  onPressed: _busy ? null : _postShout,
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.cyan, foregroundColor: Colors.black),
                  child: const Text('Shout', style: TextStyle(fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ),
          Expanded(
            child: shoutsAsync.when(
              data: (shouts) {
                if (shouts.isEmpty) {
                  return const Center(child: Text('No transmissions recorded yet.', style: TextStyle(color: AppColors.textMuted)));
                }

                return ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  itemCount: shouts.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final s = shouts[index];
                    final author = s['author'] as Map? ?? {};
                    final nick = author['nickname'] as String? ?? 'Citizen';
                    final code = author['citizenshipCountry']?['code'] as String? ?? 'INT';
                    final content = s['content'] as String? ?? '';

                    return TacticalCard(
                      padding: const EdgeInsets.all(10),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(color: AppColors.surfaceElevated, borderRadius: BorderRadius.circular(4)),
                            child: Text(code, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 10, color: AppColors.cyan)),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(nick, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: AppColors.textSecondary)),
                                const SizedBox(height: 2),
                                Text(content, style: const TextStyle(color: AppColors.textPrimary, fontSize: 13)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                );
              },
              loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
              error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(shoutsProvider))),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPortalsTab() {
    final portalsAsync = ref.watch(portalsProvider);

    return RefreshIndicator(
      color: AppColors.cyan,
      backgroundColor: AppColors.surface,
      onRefresh: () async => ref.invalidate(portalsProvider),
      child: portalsAsync.when(
        data: (portals) {
          if (portals.isEmpty) {
            return const Center(child: Text('No media portals registered.', style: TextStyle(color: AppColors.textMuted)));
          }

          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: portals.length,
            separatorBuilder: (_, _) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              final p = portals[index];
              final id = p['id'] as String;
              final name = p['name'] as String? ?? 'Portal';
              final owner = p['owner']?['nickname'] as String? ?? 'Editor';
              final count = p['_count'] as Map? ?? {};
              final articlesCount = count['articles'] as int? ?? 0;
              final subscribersCount = count['subscribers'] as int? ?? 0;

              final isOwner = p['isOwner'] == true;
              final isSubscribed = p['isSubscribed'] == true || _subscribedPortalIds.contains(id);

              return TacticalCard(
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14), overflow: TextOverflow.ellipsis),
                          const SizedBox(height: 4),
                          Row(
                            children: [
                              RatingWidget(targetType: 'NEWS_PORTAL', targetId: id, compact: true),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  'By $owner • $articlesCount articles • $subscribersCount subs',
                                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    if (isOwner)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppColors.amber.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: AppColors.amber.withValues(alpha: 0.4)),
                        ),
                        child: const Text('My Portal', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.amber)),
                      )
                    else if (isSubscribed)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppColors.emerald.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: AppColors.emerald.withValues(alpha: 0.4)),
                        ),
                        child: const Text('Subscribed ✓', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: AppColors.emerald)),
                      )
                    else
                      ElevatedButton(
                        onPressed: _busy ? null : () => _subscribe(id),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.surfaceElevated,
                          foregroundColor: AppColors.cyan,
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        ),
                        child: const Text('Subscribe', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                      ),
                  ],
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator(color: AppColors.cyan)),
        error: (e, _) => Center(child: TacticalErrorCard(error: e, onRetry: () => ref.invalidate(portalsProvider))),
      ),
    );
  }

  void _createNewspaper() async {
    final name = _newspaperNameCtrl.text.trim();
    if (name.length < 3) {
      showErrorPopup(context, 'Newspaper name must be at least 3 characters', title: 'VALIDATION ERROR');
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(mediaRepositoryProvider).createNewspaper(name: name, avatarColor: _avatarColor);
      ref.invalidate(myNewspaperProvider);
      await ref.read(citizenNotifierProvider.notifier).refresh();
      if (mounted) {
        showSuccessPopup(context, 'Newspaper registered! You can now write articles.', title: 'PRESS REGISTERED');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'REGISTRATION FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _publishArticle() async {
    final title = _titleCtrl.text.trim();
    final body = _bodyCtrl.text.trim();
    if (title.isEmpty || body.isEmpty) {
      showErrorPopup(context, 'Please enter headline and body text', title: 'VALIDATION ERROR');
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(mediaRepositoryProvider).publishArticle(title: title, body: body, scope: _scope);
      _titleCtrl.clear();
      _bodyCtrl.clear();
      ref.invalidate(articlesProvider);
      _tabController.animateTo(0);
      if (mounted) {
        showSuccessPopup(context, 'Article published!', title: 'EDITORIAL PUBLISHED');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'PUBLICATION FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _upvote(String id) async {
    setState(() => _busy = true);
    try {
      await ref.read(mediaRepositoryProvider).upvoteArticle(id);
      if (mounted) {
        setState(() => _upvotedArticleIds.add(id));
        showSuccessPopup(context, 'Endorsed article with your vote!', title: 'UPVOTED');
      }
      ref.invalidate(articlesProvider);
    } catch (e) {
      final msg = e.toString().toLowerCase();
      if (msg.contains('already upvoted')) {
        setState(() => _upvotedArticleIds.add(id));
      }
      if (mounted) showErrorPopup(context, e, title: 'ENDORSEMENT FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _tip(String id) async {
    try {
      await ref.read(mediaRepositoryProvider).tipArticle(id);
      ref.invalidate(articlesProvider);
      await ref.read(citizenNotifierProvider.notifier).refresh();
      if (mounted) {
        showSuccessPopup(context, 'Tipped author 1 Gold!', title: 'TIP RECORDED');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'TIP TRANSFER FAILED');
    }
  }

  void _postShout() async {
    final text = _shoutCtrl.text.trim();
    if (text.isEmpty) return;
    setState(() => _busy = true);
    try {
      await ref.read(mediaRepositoryProvider).postShout(text);
      _shoutCtrl.clear();
      ref.invalidate(shoutsProvider);
      if (mounted) {
        showSuccessPopup(context, 'Transmission broadcasted!', title: 'SHOUT BROADCASTED');
      }
    } catch (e) {
      if (mounted) showErrorPopup(context, e, title: 'TRANSMISSION FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _subscribe(String portalId) async {
    setState(() => _busy = true);
    try {
      await ref.read(mediaRepositoryProvider).subscribeToPortal(portalId);
      if (mounted) {
        setState(() => _subscribedPortalIds.add(portalId));
        showSuccessPopup(context, 'Subscribed to publication portal!', title: 'SUBSCRIBED');
      }
      ref.invalidate(portalsProvider);
    } catch (e) {
      final msg = e.toString().toLowerCase();
      if (msg.contains('already subscribed')) {
        setState(() => _subscribedPortalIds.add(portalId));
      }
      if (mounted) showErrorPopup(context, e, title: 'SUBSCRIPTION FAILED');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
