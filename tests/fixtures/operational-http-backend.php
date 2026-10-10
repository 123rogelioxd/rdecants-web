<?php

// Local synthetic QA entrypoint. Never installed into the application's routes.
declare(strict_types=1);

$root = realpath((string) getenv('QA_BACKEND_ROOT'));
$directory = realpath((string) getenv('QA_HTTP_DIRECTORY'));
$database = realpath((string) getenv('DB_DATABASE'));
if (getenv('APP_ENV') !== 'testing' || getenv('DB_CONNECTION') !== 'sqlite'
    || ! $root || ! $directory || ! $database
    || dirname($database) !== $directory || basename($database) !== 'synthetic.sqlite'
    || (PHP_SAPI !== 'cli' && ($_SERVER['REMOTE_ADDR'] ?? '') !== '127.0.0.1')) {
    throw new RuntimeException('QA requires testing + its own synthetic SQLite + loopback.');
}

require $root.'/vendor/autoload.php';
$app = require $root.'/bootstrap/app.php';
$app->useStoragePath($directory.'/storage');
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
Illuminate\Support\Facades\Http::preventStrayRequests();
$state = json_decode(file_get_contents($directory.'/state.json'), true, flags: JSON_THROW_ON_ERROR);
Illuminate\Support\Carbon::setTestNow($state['now']);
config([
    'tenancy.rdecants_organization_slug' => $state['organization_slug'] ?? 'rdecants',
    'cors.allowed_origins' => [$state['frontend_origin'], 'https://rdecants.com'],
    'storefront_checkout.secure_continuity_enabled' => true,
    'storefront_checkout.saved_addresses_enabled' => true,
    'storefront_checkout.order_notifications_enabled' => true,
    'commerce.web_intake.enabled' => true,
    'commerce.orders.enabled' => true,
    'commerce.mercado_pago_links.enabled' => false,
    'commerce.shipping.enabled' => false,
    'services.whatsapp.sales_number' => '529510000000',
    'delivery.routing.enabled' => false,
    'delivery.subsidy.enabled' => false,
    'shipping.origin.postal_code' => '68000',
    'shipping.packaging.profiles.decant_small.weight_kg' => .3,
    'shipping.packaging.profiles.decant_small.length_cm' => 10,
    'shipping.packaging.profiles.decant_small.width_cm' => 10,
    'shipping.packaging.profiles.decant_small.height_cm' => 10,
]);

// Only the external carrier boundary is replaced. Domain pricing, signed quote
// tokens, controllers, tenancy, consent, cookie and inventory all remain real.
$provider = new class implements App\Services\Shipping\Contracts\ShippingProviderInterface {
    public function name(): string { return 'Synthetic carrier'; }
    public function key(): string { return 'skydropx'; }
    public function isConfigured(): bool { return true; }
    public function getRates(App\Models\Shipping\Shipment $shipment): array
    {
        return [new App\Models\Shipping\ShipmentRate([
            'provider' => 'skydropx', 'carrier' => 'Synthetic', 'service_name' => 'Fixture',
            'amount' => 30, 'currency' => 'MXN', 'provider_rate_id' => 'synthetic-rate',
            'expires_at' => now()->addMinutes(30),
        ])];
    }
    public function purchaseRate(App\Models\Shipping\Shipment $shipment, App\Models\Shipping\ShipmentRate $rate): void
    {
        throw new RuntimeException('QA must never purchase a label.');
    }
};
$app->instance(App\Services\Shipping\ShippingService::class, new class($provider) extends App\Services\Shipping\ShippingService {
    public function __construct(private App\Services\Shipping\Contracts\ShippingProviderInterface $qaProvider) {}
    public function defaultProvider(): App\Services\Shipping\Contracts\ShippingProviderInterface { return $this->qaProvider; }
});

if (PHP_SAPI === 'cli') {
    $command = $argv[1] ?? '';
    if ($command === 'setup') {
        if (filesize($database) !== 0) { throw new RuntimeException('Refuse to migrate a non-empty QA database.'); }
        Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
        $org = App\Models\Organization::default();
        App\Models\Organization::create(['name' => 'Synthetic other tenant', 'slug' => 'qa-other', 'status' => App\Models\Organization::STATUS_ACTIVE]);
        $app->make(App\Tenancy\TenantContext::class)->activate((int) $org->id, App\Tenancy\TenantContextSource::Test);
        $owner = App\Models\User::factory()->create(['name' => 'Synthetic sales owner', 'organization_id' => $org->id]);
        App\Models\Operations\OperationalRoleAssignment::create(['role_key' => 'sales', 'primary_user_id' => $owner->id]);
        $zone = App\Models\Fulfillment\DeliveryZone::create(['key' => 'qa_synthetic', 'name' => 'Synthetic zone', 'active' => true, 'fee_amount' => 40, 'manual_quote' => false, 'priority' => 1000]);
        $zone->areas()->create(['postal_code' => '68000']);
        $products = [];
        foreach (['First fixture' => 150, 'Second fixture' => 200, 'Last unit fixture' => 100] as $name => $price) {
            $product = Database\Factories\ProductoFactory::new()->decant([
                'nombre' => $name, 'marca' => 'Synthetic', 'ml_disponibles' => $price === 100 ? 5 : 500,
                'ml_totales' => $price === 100 ? 5 : 500,
            ])->create();
            $variant = Database\Factories\VarianteProductoFactory::new()->forProducto($product)->decant(['precio_venta' => $price])->create();
            $products[] = ['product_id' => $product->id, 'variant_id' => $variant->id, 'price' => $price];
        }
        echo json_encode(['organization_id' => $org->id, 'owner_id' => $owner->id, 'products' => $products], JSON_THROW_ON_ERROR);
    } elseif ($command === 'inspect') {
        $org = App\Models\Organization::default();
        $app->make(App\Tenancy\TenantContext::class)->activate((int) $org->id, App\Tenancy\TenantContextSource::Test);
        $orders = App\Models\WebOrder::with('items')->orderBy('id')->get()->map(function ($order) use ($app) {
            $fulfillment = App\Models\SaleFulfillment::where('web_order_id', $order->id)->first();
            $card = $fulfillment ? $app->make(App\Services\Fulfillment\OperationBoardQuery::class)->card($fulfillment, (int) $order->organization_id) : null;
            return [
                'id' => $order->id, 'folio' => $order->folio, 'status' => $order->status,
                'total' => (float) $order->total, 'shipping' => $order->shippingCost(), 'grand_total' => $order->grandTotal(),
                'address' => $order->deliveryAddress(), 'metadata' => $order->metadata,
                'preference' => $order->deliveryPreference(),
                'items' => $order->items->map(fn ($item) => ['name' => $item->product_name, 'quantity' => $item->quantity, 'ml' => $item->ml, 'price' => (float) $item->unit_price])->all(),
                'operation' => $card ? ['date' => $card->deliveryDate?->format('Y-m-d'), 'requested_window' => $card->requestedWindowLabel, 'items' => count($card->items), 'collection_status' => $card->collectionStatus] : null,
            ];
        });
        echo json_encode([
            'orders' => $orders, 'reservations' => App\Models\InventoryReservation::count(),
            'notifications' => App\Models\NotificationDelivery::get(['id', 'organization_id', 'user_id', 'status', 'title', 'body', 'target_url', 'deduplication_key']),
            'sessions' => App\Models\CustomerWebSession::get(['id', 'cliente_id', 'identity_provenance', 'revoked_at']),
            'commerce_count' => App\Models\Commerce\CommerceOrder::count(), 'sales_count' => App\Models\Venta::count(),
            'shipments_count' => App\Models\Shipping\Shipment::count(),
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
    } elseif ($command === 'expire-session') {
        App\Models\CustomerWebSession::query()->where('id', (int) ($argv[2] ?? 0))->update(['expires_at' => now()->subMinute()]);
        echo '{"expired":true}';
    } else { throw new RuntimeException('Unknown QA command.'); }
    exit;
}

$request = Illuminate\Http\Request::capture();
// No QA routes are exposed. Only the canonical storefront API is reachable.
if (! str_starts_with($request->getPathInfo(), '/api/web/')) { http_response_code(404); exit; }
$kernel = $app->make(Illuminate\Contracts\Http\Kernel::class);
$response = $kernel->handle($request);
$response->send();
$kernel->terminate($request, $response);
