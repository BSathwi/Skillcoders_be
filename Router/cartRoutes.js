const express = require("express");
const pool = require("../DbConnection/db");
const {verifyToken,verifyAdmin} = require("../middleware/authMiddle");
const cartRouter = express.Router();


cartRouter.post("/cart/add", verifyToken, async (req, res) => {
    try {
        const { course_id } = req.body;
        const user_id = req.user.id;

        if (!course_id) {
            return res.status(400).json({ message: "Course ID is required" });
        }

        const [cart] = await pool.query("SELECT * FROM cart WHERE user_id = ?", [user_id]);

        let cart_id;
        if (cart.length === 0) {
            const [result] = await pool.query(
                "INSERT INTO cart (user_id, count_of_carted_applications) VALUES (?, 0)",
                [user_id]
            );
            cart_id = result.insertId; 
        } else {
            cart_id = cart[0].id;
        }

        const [existingItem] = await pool.query(
            "SELECT * FROM cart_items WHERE cart_id = ? AND course_id = ?",
            [cart_id, course_id]
        );

        if (existingItem.length > 0) {
            return res.status(400).json({ message: "Course is already in cart" });
        }

        await pool.query("INSERT INTO cart_items (cart_id, course_id) VALUES (?, ?)", [cart_id, course_id]);

        await pool.query(
            "UPDATE cart SET count_of_carted_applications = count_of_carted_applications + 1 WHERE id = ?",
            [cart_id]
        );

        res.json({ message: "Course added to cart successfully" });
    } catch (error) {
        console.error("Error adding course to cart:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});
cartRouter.get("/cart", verifyToken, async (req, res) => {
    try {
        const user_id = req.user.id;

        const [cart] = await pool.query("SELECT * FROM cart WHERE user_id = ?", [user_id]);

        if (cart.length === 0) {
            return res.status(200).json({ message: "Cart is empty", cart_items: [] });
        }

        const cart_id = cart[0].id;

        const [cartItems] = await pool.query(`
            SELECT ci.id AS cart_item_id, ci.course_id, c.course_name, c.price, c.course_image
            FROM cart_items ci
            JOIN courses c ON ci.course_id = c.id
            WHERE ci.cart_id = ?`, [cart_id]);

        res.json({ cart_items: cartItems });
    } catch (error) {
        console.error("Error fetching cart items:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});



cartRouter.delete("/cart/remove",verifyToken,async(req,res)=>{
    try {
    const {course_id}=req.body;
    const user_id=req.user.id;
    if (!course_id) {
        return res.status(400).json({ message: "Course ID is required" });
    }
    const [cart] = await pool.query("SELECT * FROM cart WHERE user_id = ?", [user_id]);
    if (cart.length === 0) {
        return res.status(404).json({ message: "Cart not found" });
    }
    const cart_id = cart[0].id;
    await pool.query("DELETE FROM cart_items WHERE cart_id = ? AND course_id = ?", [cart_id, course_id]);

    await pool.query("UPDATE cart SET count_of_carted_applications = count_of_carted_applications - 1 WHERE id = ?", [cart_id]);

    const [remainingItems] = await pool.query("SELECT * FROM cart_items WHERE cart_id = ?", [cart_id]);
    if (remainingItems.length === 0) {
        await pool.query("DELETE FROM cart WHERE id = ?", [cart_id]);
    
    }
    res.json({ message: "Course removed from cart successfully" });
} catch (error) {
    console.error("Error removing course from cart:", error);
    res.status(500).json({ message: "Internal server error" });
}
});



module.exports=cartRouter;